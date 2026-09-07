import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { TENANT_PERMISSIONS } from '@package/constants';
import { sql, type File as DbFile, type NodePgDatabase } from '@package/db-core';
import { Errors } from '@package/errors';
import { StorageObjectNotFoundError, StorageRegistryService } from '@package/storage';

import { ProjectSortBy, ProjectSortOrder } from '../../projects/dto/query-projects.dto';
import { ProjectMemberRepository, ProjectRepository } from '../../projects/repositories';
import { ProjectsService } from '../../projects/services/projects.service';
import { buildTenantAuditEvent } from '../../tenants/events/tenant-audit-event';
import { MemberStatusFilter } from '../../tenants/queries/get-members.query';
import { TenantService } from '../../tenants/services/tenant.service';
import {
  CreateIssueAttachmentDto,
  CreateIssueAttachmentUploadDto,
  CreateIssueLabelDto,
  CreateIssueCommentDto,
  CreateIssueDto,
  CreateIssueRelationDto,
  MutateIssueLabelDto,
  MutateIssueParticipantDto,
  UpdateIssueLabelDto,
  UpdateIssueDto
} from '../dto';
import {
  IssueActivityRepository,
  IssueAttachmentRepository,
  IssueAssigneeRepository,
  IssueCommentRepository,
  IssueLabelRepository,
  IssueRelationRepository,
  IssueRepository,
  IssueWatcherRepository
} from '../repositories';

import type { IssueSortBy, IssueSortOrder } from '../dto/query-issues.dto';
import type { VisibleIssueRow } from '../repositories/issue.repository';
import type {
  IssueActivityDtoShape,
  IssueAttachmentDtoShape,
  IssueCommentDtoShape,
  IssueDetailDtoShape,
  IssueLabelDtoShape,
  IssueListItemDtoShape,
  IssueParticipantDtoShape,
  IssueProjectDtoShape,
  IssueRelationDtoShape,
  IssuesSummaryDtoShape,
  IssuePageDtoShape,
  IssueWorkspaceProjectDtoShape,
  IssueWorkspaceProjectMemberDtoShape,
  MyWorkPageDtoShape,
  WorkspaceIssuesPageDtoShape
} from '../types/issue.types';
import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { FileUploadReservationDtoShape } from '@/modules/storage/types/file.types';
import type { Readable } from 'node:stream';

import { MAIN_DB } from '@/common/database/database.constants';
import { ApiException } from '@/common/errors/api-exception';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { AvatarUrlResolverService } from '@/modules/auth/services/avatar-url-resolver.service';
import { CreateFileUploadDto } from '@/modules/storage/dto';
import { FileRepository } from '@/modules/storage/repositories';
import { StorageFilesService } from '@/modules/storage/services';

const WORKSPACE_ISSUES_PAGE_SIZE = 500;
const MY_WORK_ISSUES_PAGE_SIZE = 25;
const ACTIVE_MEMBER_PAGE_SIZE = 100;
const PROJECT_LIST_PAGE_SIZE = 100;
const RELATION_CANDIDATES_PAGE_SIZE = 100;

type TenantMembersPageResponse = {
  data: Array<{
    userId: string;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
    joinedAt: string;
  }>;
  metadata: {
    pagination: {
      hasNext: boolean;
    };
  };
};

@Injectable()
export class IssuesService {
  constructor(
    private readonly issueRepository: IssueRepository,
    private readonly issueAttachmentRepository: IssueAttachmentRepository,
    private readonly issueAssigneeRepository: IssueAssigneeRepository,
    private readonly issueLabelRepository: IssueLabelRepository,
    private readonly issueCommentRepository: IssueCommentRepository,
    private readonly issueWatcherRepository: IssueWatcherRepository,
    private readonly issueRelationRepository: IssueRelationRepository,
    private readonly issueActivityRepository: IssueActivityRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly projectsService: ProjectsService,
    private readonly tenantService: TenantService,
    private readonly fileRepository: FileRepository,
    private readonly storageFilesService: StorageFilesService,
    private readonly storageRegistry: StorageRegistryService,
    private readonly auditOutbox: AuditOutboxPublisher,
    private readonly avatarUrlResolver: AvatarUrlResolverService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async getIssueAttachmentContent(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    attachmentIdValue: string,
    trace: RequestTrace = {}
  ): Promise<{
    body: Readable;
    contentType: string;
    contentLength?: number;
    contentDisposition: string;
    etag?: string;
    lastModified?: Date;
  }> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const attachmentId = this.parseNumericId(attachmentIdValue, 'attachmentId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const attachment = await this.issueAttachmentRepository.findActiveByIdWithDatabase(
      this.db,
      tenantId,
      issueId,
      attachmentId
    );
    if (attachment?.fileId == null) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueAttachment' });
    }

    const file = await this.fileRepository.findByIdIncludingDeletedOrThrowWithDatabase(
      this.db,
      tenantId,
      attachment.fileId
    );
    if (
      file.purpose !== 'issue_attachment' ||
      file.status !== 'ready' ||
      file.deletedAt !== null ||
      file.purgedAt !== null
    ) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueAttachment' });
    }

    const provider = this.storageRegistry.get(file.storageInstance);

    let object;
    try {
      object = await provider.getObject({
        bucket: file.bucket,
        key: file.objectKey
      });
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        throw Errors.databaserecordNotFound004({ entity: 'IssueAttachment' });
      }

      throw error;
    }

    const accessedAt = new Date();
    await this.db.transaction(async (tx) => {
      await this.fileRepository.touchLastAccessedAtWithDatabase(tx, tenantId, file.id, accessedAt);

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.attachment.downloaded.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'GET_ISSUE_ATTACHMENT_CONTENT',
          details: {
            issueId: String(issueId),
            attachmentId: String(attachmentId),
            fileId: String(file.id),
            storageInstance: file.storageInstance
          }
        })
      );
    });

    return {
      body: object.body,
      contentType: object.contentType ?? file.mimeType ?? 'application/octet-stream',
      contentLength: object.contentLength,
      contentDisposition: this.buildAttachmentContentDisposition(file.originalFilename),
      etag: object.etag,
      lastModified: object.lastModified
    };
  }

  async listIssues(params: {
    tenantId: string;
    userId: string;
    roles?: readonly string[];
    page?: number;
    pageSize?: number;
    projectId?: number;
    labelId?: number;
    assigneeUserId?: number;
    watcherUserId?: number;
    activityActorUserId?: number;
    search?: string;
    status?: IssueListItemDtoShape['status'];
    priority?: IssueListItemDtoShape['priority'];
    sortBy?: IssueSortBy;
    sortOrder?: IssueSortOrder;
  }): Promise<{
    data: IssueListItemDtoShape[];
    metadata: {
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
      };
    };
  }> {
    const tenantId = this.parseNumericId(params.tenantId, 'tenantId');
    const userId = this.parseNumericId(params.userId, 'userId');
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    if (params.projectId !== undefined) {
      await this.projectRepository.findVisibleByIdOrThrow(tenantId, params.projectId, {
        userId,
        roles: params.roles
      });
    }

    const { data, total } = await this.issueRepository.listVisibleIssues(
      tenantId,
      { userId, roles: params.roles },
      {
        page,
        pageSize,
        projectId: params.projectId,
        labelId: params.labelId,
        assigneeUserId: params.assigneeUserId,
        watcherUserId: params.watcherUserId,
        activityActorUserId: params.activityActorUserId,
        search: params.search,
        status: params.status,
        priority: params.priority,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder
      }
    );

    const items = await this.enrichIssueListItems(tenantId, data);

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return {
      data: items,
      metadata: {
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1
        }
      }
    };
  }

  async getWorkspaceIssuesPage(params: {
    tenantId: string;
    userId: string;
    roles?: readonly string[];
  }): Promise<WorkspaceIssuesPageDtoShape> {
    const tenantId = this.parseNumericId(params.tenantId, 'tenantId');
    const userId = this.parseNumericId(params.userId, 'userId');

    const [issues, labels, projects, organizationMembers] = await Promise.all([
      this.listIssues({
        tenantId: params.tenantId,
        userId: params.userId,
        roles: params.roles,
        page: 1,
        pageSize: WORKSPACE_ISSUES_PAGE_SIZE,
        sortBy: 'updatedAt',
        sortOrder: 'desc'
      }),
      this.listIssueLabels(params.tenantId, params.userId, params.roles),
      this.listWorkspaceProjects(tenantId, userId, params.roles),
      this.listActiveOrganizationAssigneeMembers(params.tenantId)
    ]);

    const projectLookup = new Map(projects.map((project) => [project.id, project]));
    const privateProjectIds = Array.from(
      new Set(
        issues.data.flatMap((issue) => {
          const projectVisibility =
            issue.project?.visibility ??
            (issue.projectId !== null ? projectLookup.get(issue.projectId)?.visibility : null);

          return issue.projectId !== null && projectVisibility === 'private'
            ? [issue.projectId]
            : [];
        })
      )
    );

    const privateProjectMembers: Record<string, IssueWorkspaceProjectMemberDtoShape[]> =
      privateProjectIds.length > 0
        ? await this.projectsService.listProjectMembersBulk(
            params.tenantId,
            params.userId,
            params.roles,
            privateProjectIds.map((projectId) => String(projectId))
          )
        : {};

    return {
      issues,
      labels,
      projects,
      organizationMembers,
      privateProjectMembersByProjectId: Object.fromEntries(
        Object.entries(
          privateProjectMembers as Record<string, IssueWorkspaceProjectMemberDtoShape[]>
        ).map(([projectId, members]) => [
          String(projectId),
          members.map((member) => this.toWorkspaceProjectMemberDto(member))
        ])
      )
    };
  }

  async getMyWorkPage(params: {
    tenantId: string;
    userId: string;
    roles?: readonly string[];
  }): Promise<MyWorkPageDtoShape> {
    const tenantId = this.parseNumericId(params.tenantId, 'tenantId');
    const userId = this.parseNumericId(params.userId, 'userId');

    const actor = { userId, roles: params.roles };
    const listOptions = {
      page: 1,
      pageSize: MY_WORK_ISSUES_PAGE_SIZE,
      sortBy: 'updatedAt' as const,
      sortOrder: 'desc' as const
    };
    const [projects, assignedIssueResult, watchingIssueResult, recentIssueResult] =
      await Promise.all([
        this.listWorkspaceProjects(tenantId, userId, params.roles),
        this.issueRepository.listVisibleIssues(tenantId, actor, {
          ...listOptions,
          assigneeUserId: userId
        }),
        this.issueRepository.listVisibleIssues(tenantId, actor, {
          ...listOptions,
          watcherUserId: userId
        }),
        this.issueRepository.listVisibleIssues(tenantId, actor, {
          ...listOptions,
          activityActorUserId: userId
        })
      ]);
    const enrichedIssuesById = await this.enrichIssueListItemsById(tenantId, [
      ...assignedIssueResult.data,
      ...watchingIssueResult.data,
      ...recentIssueResult.data
    ]);

    const ownedProjectCount = projects.filter((project) => project.createdBy === userId).length;
    const collaborationProjectCount = projects.filter(
      (project) => project.createdBy !== userId && project.isMember
    ).length;

    return {
      assignedIssues: this.mapEnrichedIssueList(assignedIssueResult.data, enrichedIssuesById),
      assignedIssueCount: assignedIssueResult.total,
      watchingIssues: this.mapEnrichedIssueList(watchingIssueResult.data, enrichedIssuesById),
      recentIssues: this.mapEnrichedIssueList(recentIssueResult.data, enrichedIssuesById),
      accessibleProjectCount: projects.length,
      ownedProjectCount,
      collaborationProjectCount
    };
  }

  async listRelationCandidateIssues(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssueListItemDtoShape[]> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    if (issue.projectId === null) {
      return [];
    }

    const candidates = await this.listIssues({
      tenantId: tenantIdValue,
      userId: userIdValue,
      roles,
      projectId: issue.projectId,
      page: 1,
      pageSize: RELATION_CANDIDATES_PAGE_SIZE,
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    });

    return candidates.data.filter(
      (candidate) => candidate.id !== issue.id && candidate.parentIssueId === null
    );
  }

  async getIssuePage(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssuePageDtoShape> {
    const [issue, attachments] = await Promise.all([
      this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue),
      this.listIssueAttachments(tenantIdValue, userIdValue, roles, issueIdValue)
    ]);
    const members =
      issue.projectId !== null && issue.project?.visibility === 'private'
        ? await this.projectsService.listProjectMembers(
            tenantIdValue,
            userIdValue,
            roles,
            String(issue.projectId)
          )
        : await this.listActiveOrganizationAssigneeMembers(tenantIdValue);

    return {
      issue,
      attachments,
      labels: issue.labels,
      members,
      relationCandidates: await this.listRelationCandidateIssues(
        tenantIdValue,
        userIdValue,
        roles,
        issueIdValue
      )
    };
  }

  async getIssueById(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const [
      assigneeRows,
      labelRows,
      commentRows,
      watcherRows,
      relationResult,
      activityRows,
      commentsCountMap,
      attachmentsCountMap,
      subtaskCountMap,
      subtasks
    ] = await Promise.all([
      this.issueAssigneeRepository.listByIssueIds(tenantId, [issueId]),
      this.issueLabelRepository.listByIssueIds(tenantId, [issueId]),
      this.issueCommentRepository.listByIssueId(tenantId, issueId),
      this.issueWatcherRepository.listByIssueId(tenantId, issueId),
      this.issueRelationRepository.listByIssueId(tenantId, issueId),
      this.issueActivityRepository.listByIssueId(tenantId, issueId),
      this.issueRepository.countCommentsByIssueIds(tenantId, [issueId]),
      this.issueRepository.countAttachmentsByIssueIds(tenantId, [issueId]),
      this.issueRepository.countSubtasksByIssueIds(tenantId, [issueId]),
      this.issueRepository.listVisibleSubtasksByParentIssueId(tenantId, { userId, roles }, issueId)
    ]);

    const subtaskIds = subtasks.map((subtask) => subtask.id);
    const [
      subtaskAssigneeRows,
      subtaskLabelRows,
      subtaskWatcherRows,
      subtaskCommentsCountMap,
      subtaskAttachmentsCountMap,
      subtaskCountByIssueMap
    ] = await Promise.all([
      this.issueAssigneeRepository.listByIssueIds(tenantId, subtaskIds),
      this.issueLabelRepository.listByIssueIds(tenantId, subtaskIds),
      this.issueWatcherRepository.listByIssueIds(tenantId, subtaskIds),
      this.issueRepository.countCommentsByIssueIds(tenantId, subtaskIds),
      this.issueRepository.countAttachmentsByIssueIds(tenantId, subtaskIds),
      this.issueRepository.countSubtasksByIssueIds(tenantId, subtaskIds)
    ]);
    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(tenantId, [
      ...assigneeRows.map((row) => ({
        userId: row.userId,
        avatarFileId: row.avatarFileId,
        photoUrl: row.photoUrl
      })),
      ...watcherRows.map((row) => ({
        userId: row.userId,
        avatarFileId: row.avatarFileId,
        photoUrl: row.photoUrl
      })),
      ...commentRows.map((row) => ({
        userId: row.authorUserId,
        avatarFileId: row.authorAvatarFileId,
        photoUrl: row.authorPhotoUrl
      })),
      ...activityRows
        .filter((row) => row.actorUserId !== null)
        .map((row) => ({
          userId: row.actorUserId as number,
          avatarFileId: row.actorAvatarFileId,
          photoUrl: row.actorPhotoUrl
        })),
      ...subtaskAssigneeRows.map((row) => ({
        userId: row.userId,
        avatarFileId: row.avatarFileId,
        photoUrl: row.photoUrl
      }))
    ]);
    const assignees = this.groupParticipants(assigneeRows, photoUrlByUserId).get(issueId) ?? [];
    const explicitWatchers = watcherRows.map((row) => this.toParticipantDto(row, photoUrlByUserId));
    const effectiveWatchers = this.mergeParticipants(assignees, explicitWatchers);
    const subtaskAssigneesByIssueId = this.groupParticipants(subtaskAssigneeRows, photoUrlByUserId);
    const subtaskLabelsByIssueId = this.groupLabels(subtaskLabelRows);
    const subtaskExplicitWatchersByIssueId = this.groupParticipants(subtaskWatcherRows, new Map());

    const base = this.toListItemDto(issue, {
      assignees,
      labels: this.groupLabels(labelRows).get(issueId) ?? [],
      commentsCount: commentsCountMap.get(issueId) ?? 0,
      attachmentsCount: attachmentsCountMap.get(issueId) ?? 0,
      watchersCount: effectiveWatchers.length,
      subtaskCount: subtaskCountMap.get(issueId)?.total ?? 0,
      completedSubtaskCount: subtaskCountMap.get(issueId)?.done ?? 0
    });

    return {
      ...base,
      watchers: effectiveWatchers,
      comments: commentRows.map((row) => this.toCommentDto(row, photoUrlByUserId)),
      relations: (relationResult.rows as Array<Record<string, unknown>>).map((row) => ({
        id: Number(row['id']),
        relationType: String(row['relation_type']) as IssueRelationDtoShape['relationType'],
        relatedIssueId: Number(row['related_issue_id']),
        relatedIssueTitle: String(row['related_issue_title']),
        relatedIssueNumber: Number(row['related_issue_number'])
      })),
      subtasks: subtasks.map((subtask) => {
        const subtaskAssignees = subtaskAssigneesByIssueId.get(subtask.id) ?? [];
        const subtaskExplicitWatchers = subtaskExplicitWatchersByIssueId.get(subtask.id) ?? [];

        return this.toListItemDto(subtask, {
          assignees: subtaskAssignees,
          labels: subtaskLabelsByIssueId.get(subtask.id) ?? [],
          commentsCount: subtaskCommentsCountMap.get(subtask.id) ?? 0,
          attachmentsCount: subtaskAttachmentsCountMap.get(subtask.id) ?? 0,
          watchersCount: this.getEffectiveWatcherCount(subtaskAssignees, subtaskExplicitWatchers),
          subtaskCount: subtaskCountByIssueMap.get(subtask.id)?.total ?? 0,
          completedSubtaskCount: subtaskCountByIssueMap.get(subtask.id)?.done ?? 0
        });
      }),
      activity: activityRows.map((row) => this.toActivityDto(row, photoUrlByUserId))
    };
  }

  async getIssuesSummary(params: {
    tenantId: string;
    userId: string;
    roles?: readonly string[];
    projectId?: number;
    labelId?: number;
    assigneeUserId?: number;
    watcherUserId?: number;
    activityActorUserId?: number;
    search?: string;
    status?: IssueListItemDtoShape['status'];
    priority?: IssueListItemDtoShape['priority'];
  }): Promise<IssuesSummaryDtoShape> {
    const tenantId = this.parseNumericId(params.tenantId, 'tenantId');
    const userId = this.parseNumericId(params.userId, 'userId');

    if (params.projectId !== undefined) {
      await this.projectRepository.findVisibleByIdOrThrow(tenantId, params.projectId, {
        userId,
        roles: params.roles
      });
    }

    const summary = await this.issueRepository.summarizeVisibleIssues(
      tenantId,
      { userId, roles: params.roles },
      {
        projectId: params.projectId,
        labelId: params.labelId,
        assigneeUserId: params.assigneeUserId,
        watcherUserId: params.watcherUserId,
        activityActorUserId: params.activityActorUserId,
        search: params.search,
        status: params.status,
        priority: params.priority
      }
    );

    return {
      ...summary,
      open: summary.backlog + summary.inProgress + summary.blocked
    };
  }

  async listIssueComments(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssueDetailDtoShape['comments']> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const comments = await this.issueCommentRepository.listByIssueId(tenantId, issueId);
    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(
      tenantId,
      comments.map((row) => ({
        userId: row.authorUserId,
        avatarFileId: row.authorAvatarFileId,
        photoUrl: row.authorPhotoUrl
      }))
    );
    return comments.map((row) => this.toCommentDto(row, photoUrlByUserId));
  }

  async listIssueAttachments(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssueAttachmentDtoShape[]> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const attachments = await this.issueAttachmentRepository.listByIssueId(tenantId, issueId);
    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(
      tenantId,
      attachments.map((row) => ({
        userId: row.uploadedByUserId,
        avatarFileId: row.uploaderAvatarFileId,
        photoUrl: row.uploaderPhotoUrl
      }))
    );
    return attachments.map((row) => this.toIssueAttachmentDto(row, photoUrlByUserId));
  }

  async createIssueAttachmentUpload(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    createDto: CreateIssueAttachmentUploadDto,
    trace: RequestTrace = {}
  ): Promise<FileUploadReservationDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const uploadDto = new CreateFileUploadDto();
    uploadDto.purpose = 'issue_attachment';
    uploadDto.originalFilename = createDto.originalFilename;
    uploadDto.mimeType = createDto.mimeType;
    uploadDto.byteSize = createDto.byteSize;
    uploadDto.transport = createDto.transport;
    uploadDto.metadata = {
      source: 'issues-ui',
      issueId,
      projectId: issue.projectId ?? null
    };

    return this.storageFilesService.createUploadReservation(
      tenantIdValue,
      userIdValue,
      actorId,
      roles,
      uploadDto,
      trace,
      {
        issueAttachmentContext: {
          issueId,
          projectId: issue.projectId ?? null
        }
      }
    );
  }

  async listIssueAssignees(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssueParticipantDtoShape[]> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const assignees = await this.issueAssigneeRepository.listByIssueId(tenantId, issueId);
    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(
      tenantId,
      assignees.map((row) => ({
        userId: row.userId,
        avatarFileId: row.avatarFileId,
        photoUrl: row.photoUrl
      }))
    );
    return assignees.map((row) => this.toParticipantDto(row, photoUrlByUserId));
  }

  async listIssueWatchers(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssueParticipantDtoShape[]> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const [assignees, watchers] = await Promise.all([
      this.issueAssigneeRepository.listByIssueId(tenantId, issueId),
      this.issueWatcherRepository.listByIssueId(tenantId, issueId)
    ]);

    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(tenantId, [
      ...assignees.map((row) => ({
        userId: row.userId,
        avatarFileId: row.avatarFileId,
        photoUrl: row.photoUrl
      })),
      ...watchers.map((row) => ({
        userId: row.userId,
        avatarFileId: row.avatarFileId,
        photoUrl: row.photoUrl
      }))
    ]);

    return this.mergeParticipants(
      assignees.map((row) => this.toParticipantDto(row, photoUrlByUserId)),
      watchers.map((row) => this.toParticipantDto(row, photoUrlByUserId))
    );
  }

  async listIssueLabels(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined
  ): Promise<IssueLabelDtoShape[]> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const labels = await this.issueLabelRepository.listVisibleLabels(tenantId, {
      userId,
      roles
    });

    return labels.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      description: row.description,
      projectId: row.projectId
    }));
  }

  async listIssueRelations(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssueRelationDtoShape[]> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, { userId, roles });
    const relationResult = await this.issueRelationRepository.listByIssueId(tenantId, issueId);

    return (relationResult.rows as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row['id']),
      relationType: String(row['relation_type']) as IssueRelationDtoShape['relationType'],
      relatedIssueId: Number(row['related_issue_id']),
      relatedIssueTitle: String(row['related_issue_title']),
      relatedIssueNumber: Number(row['related_issue_number'])
    }));
  }

  async listIssueActivity(
    tenantIdValue: string,
    userIdValue: string,
    roles: readonly string[] | undefined,
    issueIdValue: string
  ): Promise<IssueDetailDtoShape['activity']> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const activityRows = await this.issueActivityRepository.listByIssueId(tenantId, issueId);
    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(
      tenantId,
      activityRows
        .filter((row) => row.actorUserId !== null)
        .map((row) => ({
          userId: row.actorUserId as number,
          avatarFileId: row.actorAvatarFileId,
          photoUrl: row.actorPhotoUrl
        }))
    );
    return activityRows.map((row) => this.toActivityDto(row, photoUrlByUserId));
  }

  async createIssue(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    createDto: CreateIssueDto,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const projectId =
      createDto.projectId === undefined
        ? null
        : this.parseNumericId(createDto.projectId, 'projectId');
    const parentIssueId =
      createDto.parentIssueId === undefined
        ? null
        : this.parseNumericId(createDto.parentIssueId, 'parentIssueId');

    await this.assertProjectReadable(tenantId, userId, roles, projectId);

    const createdIssueId = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${tenantId})`);
      const issueNumber = await this.issueRepository.getNextIssueNumber(tenantId);
      const status = createDto.status ?? 'backlog';
      const position =
        createDto.position ??
        (await this.issueRepository.getNextPosition(tenantId, { projectId, status }));
      const now = new Date();

      if (parentIssueId !== null) {
        const parent = await this.issueRepository.findVisibleIssueByIdOrThrow(
          tenantId,
          parentIssueId,
          {
            userId,
            roles
          }
        );
        if (parent.projectId !== projectId) {
          throw ApiException.requestValidationFailed(
            'parentIssueId',
            'must remain within the same project scope'
          );
        }
      }

      const created = await this.issueRepository.createWithDatabase(tx, tenantId, {
        projectId,
        parentIssueId,
        issueNumber,
        title: createDto.title,
        descriptionMarkdown: createDto.descriptionMarkdown ?? '',
        status,
        priority: createDto.priority ?? 'medium',
        position,
        estimate: createDto.estimate ?? null,
        dueAt: createDto.dueAt ? new Date(createDto.dueAt) : null,
        resolvedAt: status === 'done' ? now : null,
        createdBy: userId,
        updatedBy: userId,
        updatedAt: now
      });

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId: created.id,
        actorUserId: userId,
        activityType: 'issue.created',
        metadataJson: {
          issueNumber: created.issueNumber,
          projectId: created.projectId,
          parentIssueId: created.parentIssueId,
          status: created.status,
          priority: created.priority
        },
        createdAt: now
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.created.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: created.id,
          action: 'CREATE_ISSUE',
          details: {
            issueId: String(created.id),
            issueNumber: created.issueNumber,
            projectId: created.projectId === null ? null : String(created.projectId),
            status: created.status,
            priority: created.priority
          }
        })
      );

      return created.id;
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, String(createdIssueId));
  }

  async updateIssue(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    updateDto: UpdateIssueDto,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    const existing = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    // eslint-disable-next-line complexity
    const updatedIssueId = await this.db.transaction(async (tx) => {
      const locked = await this.issueRepository.findByIdOrThrowWithDatabase(tx, tenantId, issueId);
      const currentRevision = this.buildRevisionToken(locked.updatedAt);
      if (updateDto.baseRevision !== undefined && updateDto.baseRevision !== currentRevision) {
        throw ApiException.concurrentModificationConflict('issue', issueIdValue);
      }

      const nextStatus = updateDto.status ?? locked.status;
      const nextPosition =
        updateDto.position ??
        (nextStatus !== locked.status
          ? await this.issueRepository.getNextPosition(tenantId, {
              projectId: locked.projectId,
              status: nextStatus
            })
          : locked.position);
      const now = new Date();
      const nextParentIssueId =
        updateDto.parentIssueId === undefined
          ? undefined
          : updateDto.parentIssueId === null
            ? null
            : this.parseNumericId(updateDto.parentIssueId, 'parentIssueId');
      const changedFields: string[] = [];
      if (updateDto.title !== undefined && updateDto.title !== locked.title) {
        changedFields.push('title');
      }
      if (
        updateDto.descriptionMarkdown !== undefined &&
        updateDto.descriptionMarkdown !== locked.descriptionMarkdown
      ) {
        changedFields.push('description');
      }
      if (updateDto.estimate !== undefined && updateDto.estimate !== locked.estimate) {
        changedFields.push('estimate');
      }
      if (updateDto.position !== undefined && updateDto.position !== locked.position) {
        changedFields.push('position');
      }
      if (updateDto.dueAt !== undefined) {
        const nextDueAt = updateDto.dueAt ? new Date(updateDto.dueAt).toISOString() : null;
        const previousDueAt = locked.dueAt ? new Date(locked.dueAt).toISOString() : null;
        if (nextDueAt !== previousDueAt) {
          changedFields.push('dueAt');
        }
      }

      if (nextParentIssueId !== undefined) {
        if (nextParentIssueId !== null) {
          const targetParent = await this.issueRepository.findVisibleIssueByIdOrThrow(
            tenantId,
            nextParentIssueId,
            { userId, roles }
          );
          if (targetParent.projectId !== locked.projectId) {
            throw ApiException.requestValidationFailed(
              'parentIssueId',
              'must remain within the same project scope'
            );
          }
        }

        if (nextParentIssueId !== locked.parentIssueId) {
          changedFields.push('parentIssueId');
        }
      }

      const updated = await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        ...(updateDto.title !== undefined ? { title: updateDto.title } : {}),
        ...(updateDto.descriptionMarkdown !== undefined
          ? { descriptionMarkdown: updateDto.descriptionMarkdown }
          : {}),
        ...(updateDto.priority !== undefined ? { priority: updateDto.priority } : {}),
        ...(updateDto.estimate !== undefined ? { estimate: updateDto.estimate } : {}),
        ...(updateDto.dueAt !== undefined
          ? { dueAt: updateDto.dueAt ? new Date(updateDto.dueAt) : null }
          : {}),
        ...(nextParentIssueId !== undefined ? { parentIssueId: nextParentIssueId } : {}),
        status: nextStatus,
        position: nextPosition,
        resolvedAt:
          nextStatus === 'done' ? (locked.status === 'done' ? locked.resolvedAt : now) : null,
        updatedBy: userId,
        updatedAt: now
      });

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.updated',
        metadataJson: {
          changedFields,
          status: updated.status,
          priority: updated.priority
        },
        createdAt: now
      });

      if (updated.status !== locked.status) {
        await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
          issueId,
          actorUserId: userId,
          activityType: 'issue.status_changed',
          metadataJson: {
            fromStatus: locked.status,
            toStatus: updated.status
          },
          createdAt: now
        });
      }

      if (updated.priority !== locked.priority) {
        await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
          issueId,
          actorUserId: userId,
          activityType: 'issue.priority_changed',
          metadataJson: {
            fromPriority: locked.priority,
            toPriority: updated.priority
          },
          createdAt: now
        });
      }

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.updated.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: updated.id,
          action: 'UPDATE_ISSUE',
          details: {
            issueId: String(updated.id),
            issueNumber: updated.issueNumber,
            previousStatus: existing.status,
            status: updated.status,
            priority: updated.priority,
            position: updated.position
          }
        })
      );

      return updated.id;
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, String(updatedIssueId));
  }

  async deleteIssue(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    trace: RequestTrace = {}
  ): Promise<void> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    const existing = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    await this.db.transaction(async (tx) => {
      const deletedAt = new Date();
      const issueIds = await this.issueRepository.listActiveIssueTreeIdsWithDatabase(
        tx,
        tenantId,
        issueId
      );

      if (issueIds.length === 0) {
        throw Errors.databaserecordNotFound004({ entity: 'Issue' });
      }

      await this.issueCommentRepository.softDeleteByIssueIdsWithDatabase(
        tx,
        tenantId,
        issueIds,
        deletedAt
      );

      const deletedAttachments =
        await this.issueAttachmentRepository.softDeleteByIssueIdsWithDatabase(
          tx,
          tenantId,
          issueIds,
          deletedAt
        );

      const fileIds = Array.from(
        new Set(
          deletedAttachments
            .map((attachment) => attachment.fileId)
            .filter((fileId): fileId is number => fileId !== null)
        )
      );

      for (const fileId of fileIds) {
        const file = await this.fileRepository.findByIdIncludingDeletedOrThrowWithDatabase(
          tx,
          tenantId,
          fileId,
          true
        );

        if (file.deletedAt !== null) {
          continue;
        }

        const activeReferences = await this.fileRepository.countActiveReferencesWithDatabase(
          tx,
          tenantId,
          file.id
        );

        if (activeReferences.total !== 0) {
          continue;
        }

        const deletedFile = await this.fileRepository.markPendingDeleteWithDatabase(
          tx,
          tenantId,
          file.id,
          deletedAt
        );

        if (deletedFile) {
          await this.auditOutbox.insert(
            tx,
            buildTenantAuditEvent({
              eventType: 'tenant.file.deleted.audit',
              tenantId: tenantIdValue,
              actorId,
              requestId: trace.requestId,
              correlationId: trace.correlationId,
              causationId: trace.causationId,
              aggregateId: String(deletedFile.id),
              action: 'DELETE_FILE',
              details: {
                fileId: String(deletedFile.id),
                purpose: deletedFile.purpose,
                storageInstance: deletedFile.storageInstance
              }
            })
          );
        }
      }

      await this.issueLabelRepository.deleteAssignmentsByIssueIdsWithDatabase(
        tx,
        tenantId,
        issueIds
      );
      await this.issueAssigneeRepository.deleteByIssueIdsWithDatabase(tx, issueIds);
      await this.issueWatcherRepository.deleteByIssueIdsWithDatabase(tx, issueIds);
      await this.issueRelationRepository.deleteByIssueIdsWithDatabase(tx, tenantId, issueIds);
      await this.issueActivityRepository.deleteByIssueIdsWithDatabase(tx, tenantId, issueIds);

      const deletedIssues = await this.issueRepository.softDeleteByIdsWithDatabase(
        tx,
        tenantId,
        issueIds,
        userId,
        deletedAt
      );
      const deleted = deletedIssues.find((candidate) => candidate.id === issueId);

      if (!deleted) {
        throw Errors.databaserecordNotFound004({ entity: 'Issue' });
      }

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.deleted.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: deleted.id,
          action: 'DELETE_ISSUE',
          details: {
            issueId: String(deleted.id),
            issueNumber: deleted.issueNumber,
            projectId: existing.projectId === null ? null : String(existing.projectId)
          }
        })
      );
    });
  }

  async createIssueComment(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    createDto: CreateIssueCommentDto,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const createdIssueId = await this.db.transaction(async (tx) => {
      const now = new Date();
      const parentCommentId =
        createDto.parentCommentId === undefined
          ? null
          : this.parseNumericId(createDto.parentCommentId, 'parentCommentId');
      const issue = await this.issueRepository.findByIdOrThrowWithDatabase(tx, tenantId, issueId);

      if (parentCommentId !== null) {
        await this.issueCommentRepository.findVisibleByIdOrThrow(
          tx,
          tenantId,
          issueId,
          parentCommentId
        );
      }

      await this.issueCommentRepository.createWithDatabase(tx, tenantId, {
        issueId,
        authorUserId: userId,
        parentCommentId,
        bodyMarkdown: createDto.bodyMarkdown,
        createdAt: now,
        updatedAt: now
      });

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.comment_added',
        metadataJson: {
          bodyPreview: createDto.bodyMarkdown.slice(0, 140),
          parentCommentId
        },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.comment.created.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'CREATE_ISSUE_COMMENT',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            projectId: issue.projectId === null ? null : String(issue.projectId),
            parentCommentId
          }
        })
      );

      return issueId;
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, String(createdIssueId));
  }

  async createIssueAttachment(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    createDto: CreateIssueAttachmentDto,
    trace: RequestTrace = {}
  ): Promise<IssueAttachmentDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    const attachmentId = await this.db.transaction(async (tx) => {
      const now = new Date();
      const issue = await this.issueRepository.findByIdOrThrowWithDatabase(tx, tenantId, issueId);
      const file = await this.fileRepository.findByIdOrThrowWithDatabase(
        tx,
        tenantId,
        createDto.fileId
      );

      this.assertAttachableIssueFile(file, userId, issueId, issue.projectId ?? null);

      const existingAttachment =
        await this.issueAttachmentRepository.findActiveByFileIdWithDatabase(tx, tenantId, file.id);
      if (existingAttachment) {
        if (existingAttachment.issueId !== issueId) {
          throw ApiException.requestValidationFailed(
            'fileId',
            'file is already attached to a different issue'
          );
        }

        return existingAttachment.id;
      }

      const attachment = await this.issueAttachmentRepository.createWithDatabase(tx, tenantId, {
        issueId,
        uploadedByUserId: file.uploadedByUserId,
        fileId: file.id,
        storageKey: file.objectKey,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType ?? null,
        byteSize: file.byteSize,
        createdAt: now,
        deletedAt: null
      });

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.attachment_added',
        metadataJson: {
          attachmentId: attachment.id,
          fileId: file.id,
          originalFilename: file.originalFilename
        },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.attachment.created.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'CREATE_ISSUE_ATTACHMENT',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            projectId: issue.projectId === null ? null : String(issue.projectId),
            attachmentId: String(attachment.id),
            fileId: String(file.id)
          }
        })
      );

      return attachment.id;
    });

    const attachment = await this.getIssueAttachmentByIdOrThrow(tenantId, issueId, attachmentId);
    return this.toIssueAttachmentDto(attachment);
  }

  async deleteIssueAttachment(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    attachmentIdValue: string,
    trace: RequestTrace = {}
  ): Promise<void> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const attachmentId = this.parseNumericId(attachmentIdValue, 'attachmentId');

    await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    await this.db.transaction(async (tx) => {
      const issue = await this.issueRepository.findByIdOrThrowWithDatabase(tx, tenantId, issueId);
      const attachment = await this.issueAttachmentRepository.findActiveByIdWithDatabase(
        tx,
        tenantId,
        issueId,
        attachmentId
      );

      if (!attachment) {
        const existingAttachment = await this.issueAttachmentRepository.findByIdWithDatabase(
          tx,
          tenantId,
          issueId,
          attachmentId
        );
        if (existingAttachment) {
          return;
        }

        throw Errors.databaserecordNotFound004({ entity: 'IssueAttachment' });
      }

      const now = new Date();
      await this.issueAttachmentRepository.softDeleteByIdWithDatabase(
        tx,
        tenantId,
        issueId,
        attachmentId,
        now
      );

      if (attachment.fileId !== null) {
        const file = await this.fileRepository.findByIdIncludingDeletedOrThrowWithDatabase(
          tx,
          tenantId,
          attachment.fileId,
          true
        );

        if (file.deletedAt === null) {
          const activeReferences = await this.fileRepository.countActiveReferencesWithDatabase(
            tx,
            tenantId,
            file.id
          );

          if (activeReferences.total === 0) {
            const deletedFile = await this.fileRepository.markPendingDeleteWithDatabase(
              tx,
              tenantId,
              file.id,
              now
            );

            if (deletedFile) {
              await this.auditOutbox.insert(
                tx,
                buildTenantAuditEvent({
                  eventType: 'tenant.file.deleted.audit',
                  tenantId: tenantIdValue,
                  actorId,
                  requestId: trace.requestId,
                  correlationId: trace.correlationId,
                  causationId: trace.causationId,
                  aggregateId: String(deletedFile.id),
                  action: 'DELETE_FILE',
                  details: {
                    fileId: String(deletedFile.id),
                    purpose: deletedFile.purpose,
                    storageInstance: deletedFile.storageInstance
                  }
                })
              );
            }
          }
        }
      }

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.attachment_removed',
        metadataJson: {
          attachmentId,
          fileId: attachment.fileId,
          originalFilename: attachment.originalFilename
        },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.attachment.deleted.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'DELETE_ISSUE_ATTACHMENT',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            projectId: issue.projectId === null ? null : String(issue.projectId),
            attachmentId: String(attachmentId),
            fileId: attachment.fileId === null ? null : String(attachment.fileId)
          }
        })
      );
    });
  }

  async createIssueLabel(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    _roles: readonly string[] | undefined,
    createDto: CreateIssueLabelDto,
    trace: RequestTrace = {}
  ): Promise<IssueLabelDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const normalizedName = this.normalizeLabelName(createDto.name);

    await this.assertLabelNameAvailable(tenantId, normalizedName);

    const created = await this.db.transaction(async (tx) => {
      const now = new Date();
      const label = await this.issueLabelRepository.createWithDatabase(tx, tenantId, {
        organizationId: tenantId,
        projectId: null,
        name: this.sanitizeLabelName(createDto.name),
        color: createDto.color ?? null,
        description: createDto.description?.trim() ?? null,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.label.created.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: label.id,
          action: 'CREATE_ISSUE_LABEL',
          details: {
            labelId: String(label.id),
            name: label.name
          }
        })
      );

      return label;
    });

    return {
      id: created.id,
      name: created.name,
      color: created.color,
      description: created.description,
      projectId: created.projectId
    };
  }

  async createIssueRelation(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    createDto: CreateIssueRelationDto,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const targetIssueId = this.parseNumericId(createDto.targetIssueId, 'targetIssueId');

    const sourceIssue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });
    const targetIssue = await this.issueRepository.findVisibleIssueByIdOrThrow(
      tenantId,
      targetIssueId,
      { userId, roles }
    );

    if (sourceIssue.id === targetIssue.id) {
      throw ApiException.requestValidationFailed(
        'targetIssueId',
        'must not reference the same issue'
      );
    }

    if (sourceIssue.projectId !== targetIssue.projectId) {
      throw ApiException.requestValidationFailed(
        'targetIssueId',
        'must remain within the same project scope'
      );
    }

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await this.issueRelationRepository.createWithDatabase(tx, tenantId, {
        sourceIssueId: issueId,
        targetIssueId,
        relationType: createDto.relationType,
        createdBy: userId,
        createdAt: now
      });

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.relation_added',
        metadataJson: {
          relationType: createDto.relationType,
          relatedIssueId: targetIssueId,
          relatedIssueNumber: targetIssue.issueNumber
        },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.relation.created.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'CREATE_ISSUE_RELATION',
          details: {
            issueId: String(issueId),
            issueNumber: sourceIssue.issueNumber,
            targetIssueId: String(targetIssueId),
            targetIssueNumber: targetIssue.issueNumber,
            relationType: createDto.relationType
          }
        })
      );
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue);
  }

  async deleteIssueRelation(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    relationIdValue: string,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const relationId = this.parseNumericId(relationIdValue, 'relationId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });
    const relation = await this.issueRelationRepository.findByIdOrThrow(tenantId, relationId);

    if (relation.sourceIssueId !== issueId && relation.targetIssueId !== issueId) {
      throw ApiException.requestValidationFailed(
        'relationId',
        'must belong to the requested issue'
      );
    }

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await this.issueRelationRepository.deleteWithDatabase(tx, relationId);
      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.relation_removed',
        metadataJson: {
          relationId,
          relationType: relation.relationType,
          relatedIssueId:
            relation.sourceIssueId === issueId ? relation.targetIssueId : relation.sourceIssueId
        },
        createdAt: now
      });
      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });
      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.relation.deleted.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'DELETE_ISSUE_RELATION',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            relationId: String(relationId),
            relationType: relation.relationType
          }
        })
      );
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue);
  }

  async updateIssueLabel(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    labelIdValue: string,
    updateDto: UpdateIssueLabelDto,
    trace: RequestTrace = {}
  ): Promise<IssueLabelDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const labelId = this.parseNumericId(labelIdValue, 'labelId');
    const existing = await this.issueLabelRepository.findVisibleByIdOrThrow(tenantId, labelId, {
      userId,
      roles
    });

    if (updateDto.name !== undefined) {
      await this.assertLabelNameAvailable(
        tenantId,
        this.normalizeLabelName(updateDto.name),
        labelId
      );
    }

    const updated = await this.db.transaction(async (tx) => {
      const now = new Date();
      const label = await this.issueLabelRepository.updateWithDatabase(tx, tenantId, labelId, {
        ...(updateDto.name !== undefined ? { name: this.sanitizeLabelName(updateDto.name) } : {}),
        ...(updateDto.color !== undefined ? { color: updateDto.color || null } : {}),
        ...(updateDto.description !== undefined
          ? { description: updateDto.description?.trim() ?? null }
          : {}),
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.label.updated.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: label.id,
          action: 'UPDATE_ISSUE_LABEL',
          details: {
            labelId: String(label.id),
            previousName: existing.name,
            name: label.name
          }
        })
      );

      return label;
    });

    return {
      id: updated.id,
      name: updated.name,
      color: updated.color,
      description: updated.description,
      projectId: updated.projectId
    };
  }

  async deleteIssueLabel(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    labelIdValue: string,
    trace: RequestTrace = {}
  ): Promise<void> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const labelId = this.parseNumericId(labelIdValue, 'labelId');
    const existing = await this.issueLabelRepository.findVisibleByIdOrThrow(tenantId, labelId, {
      userId,
      roles
    });

    await this.db.transaction(async (tx) => {
      const deletedAt = new Date();
      await this.issueLabelRepository.softDeleteWithDatabase(
        tx,
        tenantId,
        labelId,
        userId,
        deletedAt
      );

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.label.deleted.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: labelId,
          action: 'DELETE_ISSUE_LABEL',
          details: {
            labelId: String(labelId),
            name: existing.name
          }
        })
      );
    });
  }

  async addIssueAssignee(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    dto: MutateIssueParticipantDto,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const assigneeUserId = this.parseNumericId(dto.userId, 'userId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    await this.assertIssueAssigneeAssignable(tenantId, issue, assigneeUserId);

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await this.issueAssigneeRepository.createWithDatabase(tx, {
        issueId,
        userId: assigneeUserId,
        assignedByUserId: userId,
        createdAt: now
      });

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.assigned',
        metadataJson: { assigneeUserId },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.assignee.added.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'ADD_ISSUE_ASSIGNEE',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            assigneeUserId: String(assigneeUserId),
            projectId: issue.projectId === null ? null : String(issue.projectId)
          }
        })
      );
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue);
  }

  async removeIssueAssignee(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    permissions: readonly string[] | undefined,
    issueIdValue: string,
    assigneeUserIdValue: string,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const assigneeUserId = this.parseNumericId(assigneeUserIdValue, 'userId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });
    this.assertCanRemoveIssueAssignee(userId, permissions, assigneeUserId);

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await this.issueAssigneeRepository.deleteWithDatabase(tx, issueId, assigneeUserId);

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.unassigned',
        metadataJson: { assigneeUserId },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.assignee.removed.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'REMOVE_ISSUE_ASSIGNEE',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            assigneeUserId: String(assigneeUserId),
            projectId: issue.projectId === null ? null : String(issue.projectId)
          }
        })
      );
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue);
  }

  async addIssueWatcher(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    dto: MutateIssueParticipantDto,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const watcherUserId = this.parseNumericId(dto.userId, 'userId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    await this.assertParticipantAssignable(tenantId, issue.projectId, watcherUserId);

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await this.issueWatcherRepository.createWithDatabase(tx, {
        issueId,
        userId: watcherUserId,
        addedByUserId: userId,
        createdAt: now
      });

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.watcher_added',
        metadataJson: { watcherUserId },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.watcher.added.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'ADD_ISSUE_WATCHER',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            watcherUserId: String(watcherUserId),
            projectId: issue.projectId === null ? null : String(issue.projectId)
          }
        })
      );
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue);
  }

  async removeIssueWatcher(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    watcherUserIdValue: string,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const watcherUserId = this.parseNumericId(watcherUserIdValue, 'userId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await this.issueWatcherRepository.deleteWithDatabase(tx, issueId, watcherUserId);

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.watcher_removed',
        metadataJson: { watcherUserId },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.watcher.removed.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'REMOVE_ISSUE_WATCHER',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            watcherUserId: String(watcherUserId),
            projectId: issue.projectId === null ? null : String(issue.projectId)
          }
        })
      );
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue);
  }

  async addIssueLabel(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    dto: MutateIssueLabelDto,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const labelId = this.parseNumericId(dto.labelId, 'labelId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });
    const label = await this.issueLabelRepository.findVisibleByIdOrThrow(tenantId, labelId, {
      userId,
      roles
    });

    if (label.projectId !== null && label.projectId !== issue.projectId) {
      throw ApiException.requestValidationFailed(
        'labelId',
        'must remain within the same project scope'
      );
    }

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await this.issueLabelRepository.createAssignmentWithDatabase(tx, {
        issueId,
        labelId,
        createdBy: userId,
        createdAt: now
      });

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.label_added',
        metadataJson: {
          labelId,
          labelName: label.name
        },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.label.added.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'ADD_ISSUE_LABEL',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            labelId: String(labelId),
            labelName: label.name
          }
        })
      );
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue);
  }

  async removeIssueLabel(
    tenantIdValue: string,
    userIdValue: string,
    actorId: string,
    roles: readonly string[] | undefined,
    issueIdValue: string,
    labelIdValue: string,
    trace: RequestTrace = {}
  ): Promise<IssueDetailDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const issueId = this.parseNumericId(issueIdValue, 'issueId');
    const labelId = this.parseNumericId(labelIdValue, 'labelId');

    const issue = await this.issueRepository.findVisibleIssueByIdOrThrow(tenantId, issueId, {
      userId,
      roles
    });
    const label = await this.issueLabelRepository.findVisibleByIdOrThrow(tenantId, labelId, {
      userId,
      roles
    });

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await this.issueLabelRepository.deleteAssignmentWithDatabase(tx, issueId, labelId);

      await this.issueActivityRepository.createWithDatabase(tx, tenantId, {
        issueId,
        actorUserId: userId,
        activityType: 'issue.label_removed',
        metadataJson: {
          labelId,
          labelName: label.name
        },
        createdAt: now
      });

      await this.issueRepository.updateWithDatabase(tx, tenantId, issueId, {
        updatedAt: now,
        updatedBy: userId
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.issue.label.removed.audit',
          tenantId: tenantIdValue,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: issueId,
          action: 'REMOVE_ISSUE_LABEL',
          details: {
            issueId: String(issueId),
            issueNumber: issue.issueNumber,
            labelId: String(labelId),
            labelName: label.name
          }
        })
      );
    });

    return this.getIssueById(tenantIdValue, userIdValue, roles, issueIdValue);
  }

  private toListItemDto(
    issue: {
      id: number;
      organizationId: number;
      projectId: number | null;
      parentIssueId: number | null;
      issueNumber: number;
      title: string;
      descriptionMarkdown: string;
      status: IssueListItemDtoShape['status'];
      priority: IssueListItemDtoShape['priority'];
      position: number;
      estimate: number | null;
      dueAt: string | Date | null;
      resolvedAt: string | Date | null;
      createdBy: number;
      updatedBy: number;
      createdAt: string | Date;
      updatedAt: string | Date;
      projectKey: string | null;
      projectName: string | null;
      projectVisibility: IssueProjectDtoShape['visibility'] | null;
    },
    extras: {
      assignees: IssueParticipantDtoShape[];
      labels: IssueLabelDtoShape[];
      commentsCount: number;
      attachmentsCount: number;
      watchersCount: number;
      subtaskCount: number;
      completedSubtaskCount: number;
      activity?: IssueActivityDtoShape[];
    }
  ): IssueListItemDtoShape {
    return {
      id: issue.id,
      organizationId: issue.organizationId,
      projectId: issue.projectId,
      project:
        issue.projectId === null ||
        issue.projectKey === null ||
        issue.projectName === null ||
        issue.projectVisibility === null
          ? null
          : {
              id: issue.projectId,
              key: issue.projectKey,
              name: issue.projectName,
              visibility: issue.projectVisibility
            },
      parentIssueId: issue.parentIssueId,
      issueNumber: issue.issueNumber,
      title: issue.title,
      descriptionMarkdown: issue.descriptionMarkdown,
      status: issue.status,
      priority: issue.priority,
      position: issue.position,
      estimate: issue.estimate,
      dueAt: issue.dueAt,
      resolvedAt: issue.resolvedAt,
      createdBy: issue.createdBy,
      updatedBy: issue.updatedBy,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      assignees: extras.assignees,
      labels: extras.labels,
      commentsCount: extras.commentsCount,
      attachmentsCount: extras.attachmentsCount,
      watchersCount: extras.watchersCount,
      subtaskCount: extras.subtaskCount,
      completedSubtaskCount: extras.completedSubtaskCount,
      activity: extras.activity ?? []
    };
  }

  private async enrichIssueListItems(
    tenantId: number,
    issues: VisibleIssueRow[]
  ): Promise<IssueListItemDtoShape[]> {
    const enrichedById = await this.enrichIssueListItemsById(tenantId, issues);
    return issues.map(
      (issue) => enrichedById.get(issue.id) ?? this.toListItemDto(issue, this.emptyListItemExtras())
    );
  }

  private async enrichIssueListItemsById(
    tenantId: number,
    issues: VisibleIssueRow[]
  ): Promise<Map<number, IssueListItemDtoShape>> {
    const uniqueIssues = new Map<number, VisibleIssueRow>();

    for (const issue of issues) {
      if (!uniqueIssues.has(issue.id)) {
        uniqueIssues.set(issue.id, issue);
      }
    }

    const uniqueIssueList = [...uniqueIssues.values()];
    const issueIds = uniqueIssueList.map((issue) => issue.id);

    if (issueIds.length === 0) {
      return new Map();
    }

    const [
      assigneeRows,
      labelRows,
      watcherRows,
      activityRows,
      commentsCountMap,
      attachmentsCountMap,
      subtaskCountMap
    ] = await Promise.all([
      this.issueAssigneeRepository.listByIssueIds(tenantId, issueIds),
      this.issueLabelRepository.listByIssueIds(tenantId, issueIds),
      this.issueWatcherRepository.listByIssueIds(tenantId, issueIds),
      this.issueActivityRepository.listByIssueIds(tenantId, issueIds, 4),
      this.issueRepository.countCommentsByIssueIds(tenantId, issueIds),
      this.issueRepository.countAttachmentsByIssueIds(tenantId, issueIds),
      this.issueRepository.countSubtasksByIssueIds(tenantId, issueIds)
    ]);

    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(tenantId, [
      ...assigneeRows.map((row) => ({
        userId: row.userId,
        avatarFileId: row.avatarFileId,
        photoUrl: row.photoUrl
      })),
      ...activityRows
        .filter((row) => row.actorUserId !== null)
        .map((row) => ({
          userId: row.actorUserId as number,
          avatarFileId: row.actorAvatarFileId,
          photoUrl: row.actorPhotoUrl
        }))
    ]);

    const assigneesByIssueId = this.groupParticipants(assigneeRows, photoUrlByUserId);
    const labelsByIssueId = this.groupLabels(labelRows);
    const explicitWatchersByIssueId = this.groupParticipants(watcherRows, photoUrlByUserId);
    const activityByIssueId = this.groupActivity(activityRows, photoUrlByUserId);

    return new Map(
      uniqueIssueList.map((issue) => [
        issue.id,
        this.toListItemDto(issue, {
          assignees: assigneesByIssueId.get(issue.id) ?? [],
          labels: labelsByIssueId.get(issue.id) ?? [],
          commentsCount: commentsCountMap.get(issue.id) ?? 0,
          attachmentsCount: attachmentsCountMap.get(issue.id) ?? 0,
          watchersCount: this.getEffectiveWatcherCount(
            assigneesByIssueId.get(issue.id) ?? [],
            explicitWatchersByIssueId.get(issue.id) ?? []
          ),
          subtaskCount: subtaskCountMap.get(issue.id)?.total ?? 0,
          completedSubtaskCount: subtaskCountMap.get(issue.id)?.done ?? 0,
          activity: activityByIssueId.get(issue.id) ?? []
        })
      ])
    );
  }

  private mapEnrichedIssueList(
    issues: VisibleIssueRow[],
    enrichedById: ReadonlyMap<number, IssueListItemDtoShape>
  ): IssueListItemDtoShape[] {
    return issues.map(
      (issue) => enrichedById.get(issue.id) ?? this.toListItemDto(issue, this.emptyListItemExtras())
    );
  }

  private emptyListItemExtras(): {
    assignees: IssueParticipantDtoShape[];
    labels: IssueLabelDtoShape[];
    commentsCount: number;
    attachmentsCount: number;
    watchersCount: number;
    subtaskCount: number;
    completedSubtaskCount: number;
    activity: IssueActivityDtoShape[];
  } {
    return {
      assignees: [],
      labels: [],
      commentsCount: 0,
      attachmentsCount: 0,
      watchersCount: 0,
      subtaskCount: 0,
      completedSubtaskCount: 0,
      activity: []
    };
  }

  private toIssueAttachmentDto(
    row: {
      id: number;
      issueId: number;
      uploadedByUserId: number;
      uploaderDisplayName: string | null;
      uploaderAvatarFileId: number | null;
      uploaderPhotoUrl: string | null;
      fileId: number | null;
      originalFilename: string;
      mimeType: string | null;
      byteSize: number;
      status: IssueAttachmentDtoShape['status'];
      visibility: IssueAttachmentDtoShape['visibility'];
      storageInstance: string | null;
      bucket: string | null;
      objectKey: string | null;
      createdAt: Date;
    },
    photoUrlByUserId: Map<number, string | null> = new Map()
  ): IssueAttachmentDtoShape {
    return {
      id: row.id,
      issueId: row.issueId,
      uploadedByUserId: row.uploadedByUserId,
      uploaderDisplayName: row.uploaderDisplayName,
      uploaderPhotoUrl: photoUrlByUserId.get(row.uploadedByUserId) ?? null,
      fileId: row.fileId,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      status: row.status,
      visibility: row.visibility,
      storageInstance: row.storageInstance,
      bucket: row.bucket,
      objectKey: row.objectKey,
      createdAt: row.createdAt
    };
  }

  private async getIssueAttachmentByIdOrThrow(
    tenantId: number,
    issueId: number,
    attachmentId: number
  ): Promise<{
    id: number;
    issueId: number;
    uploadedByUserId: number;
    uploaderDisplayName: string | null;
    uploaderAvatarFileId: number | null;
    uploaderPhotoUrl: string | null;
    fileId: number | null;
    originalFilename: string;
    mimeType: string | null;
    byteSize: number;
    status: IssueAttachmentDtoShape['status'];
    visibility: IssueAttachmentDtoShape['visibility'];
    storageInstance: string | null;
    bucket: string | null;
    objectKey: string | null;
    createdAt: Date;
  }> {
    const attachments = await this.issueAttachmentRepository.listByIssueId(tenantId, issueId);
    const attachment = attachments.find((row) => row.id === attachmentId);

    if (!attachment) {
      throw new Error('Issue attachment read-after-write failed');
    }

    return attachment;
  }

  private assertAttachableIssueFile(
    file: DbFile,
    userId: number,
    issueId: number,
    projectId: number | null
  ): void {
    if (file.deletedAt !== null || file.purgedAt !== null) {
      throw ApiException.requestValidationFailed('fileId', 'file is no longer available');
    }

    if (file.status !== 'ready') {
      throw ApiException.requestValidationFailed('fileId', 'file must be ready before attachment');
    }

    if (file.purpose !== 'issue_attachment') {
      throw ApiException.requestValidationFailed('fileId', 'file purpose must be issue_attachment');
    }

    if (file.uploadedByUserId !== userId) {
      throw ApiException.requestValidationFailed(
        'fileId',
        'file must be uploaded by the current user before attachment'
      );
    }

    const metadata = (file.metadata ?? {}) as Record<string, unknown>;
    const reservedIssueId = this.parseOptionalMetadataId(metadata['issueId']);
    if (reservedIssueId !== null && reservedIssueId !== issueId) {
      throw ApiException.requestValidationFailed(
        'fileId',
        'file was reserved for a different issue'
      );
    }

    const reservedProjectId = this.parseOptionalMetadataId(metadata['projectId']);
    if (reservedProjectId !== null && reservedProjectId !== projectId) {
      throw ApiException.requestValidationFailed(
        'fileId',
        'file was reserved for a different project scope'
      );
    }
  }

  private parseOptionalMetadataId(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number.NaN;

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private async resolvePhotoUrlsByUserId(
    tenantId: number,
    rows: Array<{ userId: number; avatarFileId: number | null; photoUrl: string | null }>
  ): Promise<Map<number, string | null>> {
    const uniqueUsers = new Map<
      number,
      { id: number; avatarFileId: number | null; photoUrl: string | null }
    >();

    for (const row of rows) {
      if (!uniqueUsers.has(row.userId)) {
        uniqueUsers.set(row.userId, {
          id: row.userId,
          avatarFileId: row.avatarFileId,
          photoUrl: row.photoUrl
        });
      }
    }

    const resolvedEntries = await this.avatarUrlResolver.resolvePhotoUrls(String(tenantId), [
      ...uniqueUsers.values()
    ]);

    return new Map(resolvedEntries.entries());
  }

  private toParticipantDto(
    row: { userId: number; displayName: string | null },
    photoUrlByUserId: Map<number, string | null>
  ): IssueParticipantDtoShape {
    return {
      userId: row.userId,
      displayName: row.displayName,
      photoUrl: photoUrlByUserId.get(row.userId) ?? null
    };
  }

  private toCommentDto(
    row: {
      id: number;
      authorUserId: number;
      authorDisplayName: string | null;
      bodyMarkdown: string;
      createdAt: Date;
      updatedAt: Date;
    },
    photoUrlByUserId: Map<number, string | null>
  ): IssueCommentDtoShape {
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      authorDisplayName: row.authorDisplayName,
      authorPhotoUrl: photoUrlByUserId.get(row.authorUserId) ?? null,
      bodyMarkdown: row.bodyMarkdown,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private toActivityDto(
    row: {
      id: number;
      activityType: string;
      actorUserId: number | null;
      actorDisplayName: string | null;
      metadata: Record<string, unknown>;
      createdAt: Date;
    },
    photoUrlByUserId: Map<number, string | null>
  ): IssueActivityDtoShape {
    return {
      id: row.id,
      activityType: row.activityType,
      actorUserId: row.actorUserId,
      actorDisplayName: row.actorDisplayName,
      actorPhotoUrl:
        row.actorUserId === null ? null : (photoUrlByUserId.get(row.actorUserId) ?? null),
      metadata: row.metadata,
      createdAt: row.createdAt
    };
  }

  private groupParticipants(
    rows: Array<{
      issueId: number;
      userId: number;
      displayName: string | null;
    }>,
    photoUrlByUserId: Map<number, string | null> = new Map()
  ): Map<number, IssueParticipantDtoShape[]> {
    const grouped = new Map<number, IssueParticipantDtoShape[]>();

    for (const row of rows) {
      const current = grouped.get(row.issueId) ?? [];
      current.push(this.toParticipantDto(row, photoUrlByUserId));
      grouped.set(row.issueId, current);
    }

    return grouped;
  }

  private mergeParticipants(
    ...participantGroups: IssueParticipantDtoShape[][]
  ): IssueParticipantDtoShape[] {
    const merged = new Map<number, IssueParticipantDtoShape>();

    for (const group of participantGroups) {
      for (const participant of group) {
        if (!merged.has(participant.userId)) {
          merged.set(participant.userId, participant);
        }
      }
    }

    return [...merged.values()];
  }

  private getEffectiveWatcherCount(
    assignees: IssueParticipantDtoShape[],
    explicitWatchers: IssueParticipantDtoShape[]
  ): number {
    return this.mergeParticipants(assignees, explicitWatchers).length;
  }

  private groupLabels(
    rows: Array<{
      issueId: number;
      id: number;
      name: string;
      color: string | null;
      description: string | null;
      projectId: number | null;
    }>
  ): Map<number, IssueLabelDtoShape[]> {
    const grouped = new Map<number, IssueLabelDtoShape[]>();

    for (const row of rows) {
      const current = grouped.get(row.issueId) ?? [];
      current.push({
        id: row.id,
        name: row.name,
        color: row.color,
        description: row.description,
        projectId: row.projectId
      });
      grouped.set(row.issueId, current);
    }

    return grouped;
  }

  private groupActivity(
    rows: Array<{
      issueId: number;
      id: number;
      activityType: string;
      actorUserId: number | null;
      actorDisplayName: string | null;
      actorAvatarFileId: number | null;
      actorPhotoUrl: string | null;
      metadata: Record<string, unknown>;
      createdAt: Date;
    }>,
    photoUrlByUserId: Map<number, string | null> = new Map()
  ): Map<number, IssueActivityDtoShape[]> {
    const grouped = new Map<number, IssueActivityDtoShape[]>();

    for (const row of rows) {
      const current = grouped.get(row.issueId) ?? [];
      current.push(this.toActivityDto(row, photoUrlByUserId));
      grouped.set(row.issueId, current);
    }

    return grouped;
  }

  private parseNumericId(value: string | number, fieldName: string): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`${fieldName} must be a positive integer`);
    }

    return parsed;
  }

  private buildAttachmentContentDisposition(filename: string): string {
    const fallback = filename.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }

  private sanitizeLabelName(value: string): string {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw ApiException.requestValidationFailed('name', 'must not be blank');
    }

    return normalized;
  }

  private normalizeLabelName(value: string): string {
    return this.sanitizeLabelName(value).toLowerCase();
  }

  private async assertLabelNameAvailable(
    tenantId: number,
    normalizedName: string,
    excludeLabelId?: number
  ): Promise<void> {
    const existing = await this.issueLabelRepository.findByNormalizedName(
      tenantId,
      normalizedName,
      excludeLabelId
    );

    if (existing) {
      throw ApiException.requestValidationFailed('name', 'must be unique within the organization');
    }
  }

  private async assertProjectReadable(
    tenantId: number,
    userId: number,
    roles: readonly string[] | undefined,
    projectId: number | null
  ): Promise<void> {
    if (projectId === null) {
      return;
    }

    await this.projectRepository.findVisibleByIdOrThrow(tenantId, projectId, { userId, roles });
  }

  private async assertParticipantAssignable(
    tenantId: number,
    projectId: number | null,
    participantUserId: number
  ): Promise<void> {
    if (projectId === null) {
      await this.projectMemberRepository.assertAssignableOrganizationMember(
        tenantId,
        participantUserId
      );
      return;
    }

    const isMember = await this.projectMemberRepository.isProjectMember(
      tenantId,
      projectId,
      participantUserId
    );
    if (!isMember) {
      throw ApiException.requestValidationFailed(
        'userId',
        'must be an active member of the target project'
      );
    }
  }

  private async assertIssueAssigneeAssignable(
    tenantId: number,
    issue: Pick<VisibleIssueRow, 'projectId' | 'projectVisibility'>,
    assigneeUserId: number
  ): Promise<void> {
    if (issue.projectId === null || issue.projectVisibility === 'public') {
      await this.projectMemberRepository.assertAssignableOrganizationMember(
        tenantId,
        assigneeUserId
      );
      return;
    }

    const isMember = await this.projectMemberRepository.isProjectMember(
      tenantId,
      issue.projectId,
      assigneeUserId
    );
    if (!isMember) {
      throw ApiException.requestValidationFailed(
        'userId',
        'must be an active member of the target project'
      );
    }
  }

  private assertCanRemoveIssueAssignee(
    actorUserId: number,
    permissions: readonly string[] | undefined,
    assigneeUserId: number
  ): void {
    if (actorUserId === assigneeUserId) {
      return;
    }

    if (permissions?.includes(TENANT_PERMISSIONS.ISSUES_UPDATE)) {
      return;
    }

    throw new ForbiddenException('You can only remove yourself from issue assignees.');
  }

  private buildRevisionToken(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString();
  }

  private async listActiveOrganizationAssigneeMembers(
    tenantId: string
  ): Promise<IssueWorkspaceProjectMemberDtoShape[]> {
    const members: IssueWorkspaceProjectMemberDtoShape[] = [];
    let page = 1;

    while (true) {
      const query: Parameters<TenantService['getMembers']>[0] = {
        tenantId,
        page,
        pageSize: ACTIVE_MEMBER_PAGE_SIZE,
        status: MemberStatusFilter.ACTIVE
      };
      const response = (await this.tenantService.getMembers(query)) as TenantMembersPageResponse;

      members.push(
        ...response.data.map((member) => ({
          userId: Number(member.userId),
          displayName: member.displayName?.trim() ?? member.email ?? null,
          photoUrl: member.photoUrl ?? null,
          isCreator: false,
          assignedAt: member.joinedAt
        }))
      );

      if (!response.metadata.pagination.hasNext) {
        return members;
      }

      page += 1;
    }
  }

  private async listWorkspaceProjects(
    tenantId: number,
    userId: number,
    roles: readonly string[] | undefined
  ): Promise<IssueWorkspaceProjectDtoShape[]> {
    const { data } = await this.projectsService.listProjects({
      tenantId: String(tenantId),
      userId: String(userId),
      roles,
      page: 1,
      pageSize: PROJECT_LIST_PAGE_SIZE,
      sortBy: ProjectSortBy.UpdatedAt,
      sortOrder: ProjectSortOrder.Desc
    });

    return data.map((project) => ({
      id: project.id,
      organizationId: project.organizationId,
      createdBy: project.createdBy,
      key: project.key,
      name: project.name,
      visibility: project.visibility,
      isMember: Boolean(project.isMember)
    }));
  }

  private toWorkspaceProjectMemberDto(
    member: IssueWorkspaceProjectMemberDtoShape
  ): IssueWorkspaceProjectMemberDtoShape {
    return {
      userId: member.userId,
      displayName: member.displayName,
      photoUrl: member.photoUrl,
      isCreator: member.isCreator,
      assignedAt: member.assignedAt
    };
  }
}
