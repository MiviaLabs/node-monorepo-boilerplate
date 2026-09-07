import { Inject, Injectable } from '@nestjs/common';
import { SYSTEM_ROLE, TENANT_ROLE } from '@package/constants';
import { Errors } from '@package/errors';

import { ProjectRepository } from '../../projects/repositories';
import { buildTenantAuditEvent } from '../../tenants/events/tenant-audit-event';
import {
  ContentQueryScope,
  CreateContentAttachmentDto,
  CreateContentCommentDto,
  CreateContentEntryDto,
  UpdateContentEntryDto
} from '../dto';
import {
  ContentAttachmentRepository,
  ContentCommentRepository,
  ContentRepository
} from '../repositories';
import { normalizeContentSlug, slugFromTitle } from '../utils/content-slug.util';

import type { ProjectActorContext } from '../../projects/repositories/project.repository';
import type {
  ContentAttachmentDtoShape,
  ContentCommentDtoShape,
  ContentEntryDtoShape,
  ContentSidebarEntryDtoShape
} from '../types/content.types';
import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { File as DbFile, NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '@/common/database/database.constants';
import { ApiException } from '@/common/errors/api-exception';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { AvatarUrlResolverService } from '@/modules/auth/services/avatar-url-resolver.service';
import { FileRepository } from '@/modules/storage/repositories';

type PersistedContentEntry = {
  id: number;
  organizationId: number;
  projectId: number | null;
  parentId: number | null;
  title: string;
  slug: string;
  contentMarkdown: string;
  position: number;
  createdBy: number;
  updatedBy: number;
  updatedByDisplayName?: string | null;
  updatedByAvatarFileId?: number | null;
  updatedByPhotoUrl?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

@Injectable()
export class ContentService {
  constructor(
    private readonly contentAttachmentRepository: ContentAttachmentRepository,
    private readonly contentCommentRepository: ContentCommentRepository,
    private readonly contentRepository: ContentRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly fileRepository: FileRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    private readonly avatarUrlResolver: AvatarUrlResolverService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async listEntries(params: {
    tenantId: string;
    userId: string;
    roles?: readonly string[];
    scope?: ContentQueryScope;
    projectId?: string | number;
    parentId?: string | number;
  }): Promise<ContentEntryDtoShape[]> {
    const tenantId = this.parseNumericId(params.tenantId, 'tenantId');
    const userId = this.parseNumericId(params.userId, 'userId');
    const { effectiveProjectId, parentId } = await this.resolveScopeFilters({
      tenantId,
      userId,
      roles: params.roles,
      scope: params.scope,
      projectId: params.projectId,
      parentId: params.parentId
    });

    const entries = await this.contentRepository.listByScope(tenantId, {
      projectId: effectiveProjectId,
      parentId
    });
    return Promise.all(entries.map((entry) => this.toDto(tenantId, entry)));
  }

  async listSidebarEntries(params: {
    tenantId: string;
    userId: string;
    roles?: readonly string[];
    scope?: ContentQueryScope;
    projectId?: string | number;
    parentId?: string | number;
  }): Promise<ContentSidebarEntryDtoShape[]> {
    const tenantId = this.parseNumericId(params.tenantId, 'tenantId');
    const userId = this.parseNumericId(params.userId, 'userId');
    const { effectiveProjectId, parentId } = await this.resolveScopeFilters({
      tenantId,
      userId,
      roles: params.roles,
      scope: params.scope,
      projectId: params.projectId,
      parentId: params.parentId
    });

    const entries = await this.contentRepository.listSidebarEntriesByScope(tenantId, {
      projectId: effectiveProjectId,
      parentId
    });
    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(
      tenantId,
      entries.map((entry) => ({
        userId: entry.updatedBy,
        avatarFileId: entry.updatedByAvatarFileId ?? null,
        photoUrl: entry.updatedByPhotoUrl ?? null
      }))
    );

    return entries.map((entry) => this.toSidebarDto(entry, photoUrlByUserId));
  }

  async getEntryById(
    tenantId: string,
    userId: string,
    roles: readonly string[] | undefined,
    entryId: string
  ): Promise<ContentEntryDtoShape> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const entryIdNum = this.parseNumericId(entryId, 'id');

    const entry = await this.contentRepository.findEntryDetailByIdOrThrow(tenantIdNum, entryIdNum);
    await this.assertProjectReadable(tenantIdNum, entry.projectId, { userId: userIdNum, roles });
    return this.toDto(tenantIdNum, entry);
  }

  async listAttachments(
    tenantId: string,
    userId: string,
    roles: readonly string[] | undefined,
    entryId: string
  ): Promise<ContentAttachmentDtoShape[]> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const entryIdNum = this.parseNumericId(entryId, 'id');

    const entry = await this.contentRepository.findByIdOrThrow(tenantIdNum, entryIdNum);
    await this.assertProjectReadable(tenantIdNum, entry.projectId, { userId: userIdNum, roles });

    const attachments = await this.contentAttachmentRepository.listByContentEntryId(
      tenantIdNum,
      entryIdNum
    );
    return attachments.map((attachment) => this.toAttachmentDto(attachment));
  }

  async listComments(
    tenantId: string,
    userId: string,
    roles: readonly string[] | undefined,
    entryId: string
  ): Promise<ContentCommentDtoShape[]> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const entryIdNum = this.parseNumericId(entryId, 'id');

    const entry = await this.contentRepository.findByIdOrThrow(tenantIdNum, entryIdNum);
    await this.assertProjectReadable(tenantIdNum, entry.projectId, { userId: userIdNum, roles });

    const comments = await this.contentCommentRepository.listByContentEntryId(
      tenantIdNum,
      entryIdNum
    );
    const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(
      tenantIdNum,
      comments.map((row) => ({
        userId: row.authorUserId,
        avatarFileId: row.authorAvatarFileId,
        photoUrl: row.authorPhotoUrl
      }))
    );

    return comments.map((row) => this.toCommentDto(row, userIdNum, roles, photoUrlByUserId));
  }

  async getEntryBySlug(params: {
    tenantId: string;
    userId: string;
    roles?: readonly string[];
    slug: string;
    scope?: ContentQueryScope;
    projectId?: string | number;
  }): Promise<ContentEntryDtoShape> {
    const tenantId = this.parseNumericId(params.tenantId, 'tenantId');
    const userId = this.parseNumericId(params.userId, 'userId');
    const effectiveProjectId = await this.resolveScopedProjectId({
      tenantId,
      userId,
      roles: params.roles,
      scope: params.scope,
      projectId: params.projectId
    });

    const entry = await this.contentRepository.findEntryDetailBySlug(
      tenantId,
      params.slug,
      effectiveProjectId
    );
    if (!entry) {
      throw Errors.databaserecordNotFound004({ entity: 'ContentEntry' });
    }

    return this.toDto(tenantId, entry);
  }

  async createEntry(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    createDto: CreateContentEntryDto,
    trace: RequestTrace = {}
  ): Promise<ContentEntryDtoShape> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const projectId = this.parseOptionalNumericId(createDto.projectId, 'projectId');
    const parentId = this.parseOptionalNumericId(createDto.parentId, 'parentId');
    const slug =
      createDto.slug !== undefined
        ? normalizeContentSlug(createDto.slug)
        : slugFromTitle(createDto.title);

    await this.assertProjectReadable(tenantIdNum, projectId, { userId: userIdNum, roles });

    return this.db.transaction(async (tx) => {
      if (projectId !== null) {
        await this.contentRepository.ensureProjectBelongsToOrganization(tenantIdNum, projectId);
      }
      if (parentId !== null) {
        await this.contentRepository.ensureParentInSameScope(
          tenantIdNum,
          parentId,
          projectId,
          tx,
          true
        );
      }
      await this.contentRepository.ensureSlugAvailable(tenantIdNum, slug, projectId);
      const { siblingCount, targetPosition } = await this.resolveCreatePlacement(
        tx,
        tenantIdNum,
        projectId,
        parentId,
        createDto
      );

      const createdEntry = await this.contentRepository.createWithDatabase(tx, tenantIdNum, {
        projectId,
        parentId,
        title: createDto.title,
        slug,
        contentMarkdown: createDto.contentMarkdown,
        position: siblingCount,
        createdBy: userIdNum,
        updatedBy: userIdNum
      });

      if (targetPosition !== siblingCount) {
        const siblingIds = (
          await this.contentRepository.listActiveSiblingsWithDatabase(
            tx,
            tenantIdNum,
            projectId,
            parentId,
            true
          )
        )
          .map((entry) => entry.id)
          .filter((entryId) => entryId !== createdEntry.id);
        siblingIds.splice(targetPosition, 0, createdEntry.id);

        await this.contentRepository.updateSiblingPositionsWithDatabase(
          tx,
          tenantIdNum,
          siblingIds,
          userIdNum,
          new Date()
        );
      }

      const persistedCreatedEntry =
        targetPosition === siblingCount
          ? createdEntry
          : {
              ...createdEntry,
              position: targetPosition
            };

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.content.created.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: createdEntry.id,
          action: 'CREATE_CONTENT_ENTRY',
          details: {
            contentEntryId: String(createdEntry.id),
            projectId: createdEntry.projectId === null ? null : String(createdEntry.projectId),
            parentId: createdEntry.parentId === null ? null : String(createdEntry.parentId),
            slug: createdEntry.slug
          }
        })
      );

      const detailedEntry = await this.contentRepository.findEntryDetailByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        persistedCreatedEntry.id
      );
      return this.toDto(tenantIdNum, detailedEntry);
    });
  }

  async createComment(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    entryId: string,
    createDto: CreateContentCommentDto,
    trace: RequestTrace = {}
  ): Promise<ContentCommentDtoShape> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const entryIdNum = this.parseNumericId(entryId, 'id');

    const existingEntry = await this.contentRepository.findByIdOrThrow(tenantIdNum, entryIdNum);
    await this.assertProjectReadable(tenantIdNum, existingEntry.projectId, {
      userId: userIdNum,
      roles
    });

    return this.db.transaction(async (tx) => {
      const lockedEntry = await this.contentRepository.findByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        entryIdNum,
        true
      );
      const now = new Date();
      const created = await this.contentCommentRepository.createWithDatabase(tx, tenantIdNum, {
        contentEntryId: entryIdNum,
        authorUserId: userIdNum,
        bodyMarkdown: createDto.bodyMarkdown.trim(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      });

      await this.contentRepository.updateWithDatabase(tx, tenantIdNum, entryIdNum, {
        updatedBy: userIdNum,
        updatedAt: now
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.content.comment.created.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: lockedEntry.id,
          action: 'CREATE_CONTENT_COMMENT',
          details: {
            contentEntryId: String(lockedEntry.id),
            projectId: lockedEntry.projectId === null ? null : String(lockedEntry.projectId),
            parentId: lockedEntry.parentId === null ? null : String(lockedEntry.parentId),
            commentId: String(created.id)
          }
        })
      );

      const comment = await this.contentCommentRepository.findVisibleByIdOrThrow(
        tx,
        tenantIdNum,
        entryIdNum,
        created.id
      );
      const photoUrlByUserId = await this.resolvePhotoUrlsByUserId(tenantIdNum, [
        {
          userId: comment.authorUserId,
          avatarFileId: comment.authorAvatarFileId,
          photoUrl: comment.authorPhotoUrl
        }
      ]);

      return this.toCommentDto(comment, userIdNum, roles, photoUrlByUserId);
    });
  }

  async createAttachment(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    entryId: string,
    createDto: CreateContentAttachmentDto,
    trace: RequestTrace = {}
  ): Promise<ContentAttachmentDtoShape> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const entryIdNum = this.parseNumericId(entryId, 'id');

    const existingEntry = await this.contentRepository.findByIdOrThrow(tenantIdNum, entryIdNum);
    await this.assertProjectReadable(tenantIdNum, existingEntry.projectId, {
      userId: userIdNum,
      roles
    });

    const attachmentId = await this.db.transaction(async (tx) => {
      const lockedEntry = await this.contentRepository.findByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        entryIdNum,
        true
      );
      const file = await this.fileRepository.findByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        createDto.fileId
      );

      this.assertAttachableContentFile(file, userIdNum);

      const existingAttachment =
        await this.contentAttachmentRepository.findActiveByEntryAndFileWithDatabase(
          tx,
          tenantIdNum,
          entryIdNum,
          file.id
        );
      if (existingAttachment) {
        return existingAttachment.id;
      }

      const now = new Date();
      const attachment = await this.contentAttachmentRepository.createWithDatabase(
        tx,
        tenantIdNum,
        {
          contentEntryId: entryIdNum,
          fileId: file.id,
          attachedByUserId: userIdNum,
          createdAt: now,
          deletedAt: null
        }
      );

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.content.attachment.created.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: lockedEntry.id,
          action: 'CREATE_CONTENT_ATTACHMENT',
          details: {
            contentEntryId: String(lockedEntry.id),
            projectId: lockedEntry.projectId === null ? null : String(lockedEntry.projectId),
            parentId: lockedEntry.parentId === null ? null : String(lockedEntry.parentId),
            attachmentId: String(attachment.id),
            fileId: String(file.id)
          }
        })
      );

      return attachment.id;
    });

    const attachments = await this.listAttachments(tenantId, userId, roles, entryId);
    const attachment = attachments.find((row) => row.id === attachmentId);
    if (!attachment) {
      throw new Error('Content attachment read-after-write failed');
    }

    return attachment;
  }

  async updateEntry(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    entryId: string,
    updateDto: UpdateContentEntryDto,
    trace: RequestTrace = {}
  ): Promise<ContentEntryDtoShape> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const entryIdNum = this.parseNumericId(entryId, 'id');

    const existingEntry = await this.contentRepository.findByIdOrThrow(tenantIdNum, entryIdNum);
    await this.assertProjectReadable(tenantIdNum, existingEntry.projectId, {
      userId: userIdNum,
      roles
    });

    const nextSlug =
      updateDto.slug !== undefined ? normalizeContentSlug(updateDto.slug) : existingEntry.slug;
    const nextParentId =
      updateDto.parentId !== undefined
        ? this.parseOptionalNumericId(updateDto.parentId, 'parentId')
        : existingEntry.parentId;
    const hasPositionUpdate = updateDto.position !== undefined;
    const nextPosition =
      updateDto.position !== undefined
        ? this.parseNonNegativeInteger(updateDto.position, 'position')
        : existingEntry.position;

    return this.db.transaction(async (tx) => {
      const updatedAt = new Date();
      const lockedEntry = await this.contentRepository.findByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        entryIdNum,
        true
      );

      if (updateDto.baseRevision !== undefined) {
        const currentRevision = this.buildRevisionToken(lockedEntry.updatedAt);

        if (updateDto.baseRevision !== currentRevision) {
          throw ApiException.concurrentModificationConflict('content', entryId);
        }
      }

      if (updateDto.slug !== undefined && nextSlug !== lockedEntry.slug) {
        await this.contentRepository.ensureSlugAvailable(
          tenantIdNum,
          nextSlug,
          existingEntry.projectId,
          existingEntry.id
        );
      }

      if (updateDto.parentId !== undefined) {
        await this.contentRepository.ensureNoCycleOnReparent(
          tenantIdNum,
          existingEntry.id,
          nextParentId,
          tx
        );
      }

      const moveRequested =
        nextParentId !== lockedEntry.parentId ||
        hasPositionUpdate ||
        nextPosition !== lockedEntry.position;
      const targetPosition = await this.resolveTargetPosition(tx, {
        tenantId: tenantIdNum,
        existingEntry: lockedEntry,
        nextParentId,
        requestedPosition: nextPosition,
        lockForUpdate: moveRequested
      });

      if (moveRequested) {
        await this.reorderEntriesForMove(tx, {
          tenantId: tenantIdNum,
          updatedBy: userIdNum,
          updatedAt,
          existingEntry: lockedEntry,
          nextParentId,
          targetPosition
        });
      }

      const updatedEntry = await this.contentRepository.updateWithDatabase(
        tx,
        tenantIdNum,
        entryIdNum,
        {
          ...(updateDto.title !== undefined && { title: updateDto.title }),
          ...(updateDto.contentMarkdown !== undefined && {
            contentMarkdown: updateDto.contentMarkdown
          }),
          slug: nextSlug,
          ...(moveRequested && {
            parentId: nextParentId,
            position: targetPosition
          }),
          updatedBy: userIdNum,
          updatedAt
        }
      );

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.content.updated.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: updatedEntry.id,
          action: 'UPDATE_CONTENT_ENTRY',
          details: {
            contentEntryId: String(updatedEntry.id),
            projectId: updatedEntry.projectId === null ? null : String(updatedEntry.projectId),
            parentId: updatedEntry.parentId === null ? null : String(updatedEntry.parentId),
            slug: updatedEntry.slug
          }
        })
      );

      const detailedEntry = await this.contentRepository.findEntryDetailByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        updatedEntry.id
      );
      return this.toDto(tenantIdNum, detailedEntry);
    });
  }

  async deleteEntry(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    entryId: string,
    trace: RequestTrace = {}
  ): Promise<void> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const entryIdNum = this.parseNumericId(entryId, 'id');

    const existingEntry = await this.contentRepository.findByIdOrThrow(tenantIdNum, entryIdNum);
    await this.assertProjectReadable(tenantIdNum, existingEntry.projectId, {
      userId: userIdNum,
      roles
    });

    await this.db.transaction(async (tx) => {
      const lockedEntry = await this.contentRepository.findByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        entryIdNum,
        true
      );
      const deletedEntryIds = await this.contentRepository.collectActiveSubtreeIdsWithDatabase(
        tx,
        tenantIdNum,
        lockedEntry,
        true
      );
      const deletedCount = (
        await this.contentRepository.softDeleteManyWithDatabase(
          tx,
          tenantIdNum,
          deletedEntryIds,
          userIdNum
        )
      ).length;

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.content.deleted.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: existingEntry.id,
          action: 'DELETE_CONTENT_ENTRY',
          details: {
            contentEntryId: String(existingEntry.id),
            projectId: existingEntry.projectId === null ? null : String(existingEntry.projectId),
            parentId: existingEntry.parentId === null ? null : String(existingEntry.parentId),
            slug: existingEntry.slug,
            deletedCount: String(deletedCount)
          }
        })
      );
    });
  }

  async deleteComment(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    entryId: string,
    commentId: string,
    trace: RequestTrace = {}
  ): Promise<void> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const entryIdNum = this.parseNumericId(entryId, 'id');
    const commentIdNum = this.parseNumericId(commentId, 'commentId');

    const existingEntry = await this.contentRepository.findByIdOrThrow(tenantIdNum, entryIdNum);
    if (!this.hasSystemAdminScope(roles)) {
      await this.assertProjectReadable(tenantIdNum, existingEntry.projectId, {
        userId: userIdNum,
        roles
      });
    }

    await this.db.transaction(async (tx) => {
      const lockedEntry = await this.contentRepository.findByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        entryIdNum,
        true
      );
      const comment = await this.contentCommentRepository.findVisibleByIdOrThrow(
        tx,
        tenantIdNum,
        entryIdNum,
        commentIdNum,
        true
      );

      if (!this.canDeleteComment(comment.authorUserId, userIdNum, roles)) {
        throw Errors.authinsufficientPermissionsRequiredpermission004({
          requiredPermission: 'content_comment:delete'
        });
      }

      const now = new Date();
      await this.contentCommentRepository.softDeleteWithDatabase(
        tx,
        tenantIdNum,
        entryIdNum,
        commentIdNum,
        now
      );

      await this.contentRepository.updateWithDatabase(tx, tenantIdNum, entryIdNum, {
        updatedBy: userIdNum,
        updatedAt: now
      });

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.content.comment.deleted.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: lockedEntry.id,
          action: 'DELETE_CONTENT_COMMENT',
          details: {
            contentEntryId: String(lockedEntry.id),
            projectId: lockedEntry.projectId === null ? null : String(lockedEntry.projectId),
            parentId: lockedEntry.parentId === null ? null : String(lockedEntry.parentId),
            commentId: String(comment.id),
            commentAuthorUserId: String(comment.authorUserId)
          }
        })
      );
    });
  }

  private async toDto(
    tenantId: number,
    entry: PersistedContentEntry
  ): Promise<ContentEntryDtoShape> {
    const updatedByPhotoUrl = await this.avatarUrlResolver.resolvePhotoUrl(String(tenantId), {
      id: entry.updatedBy,
      avatarFileId: entry.updatedByAvatarFileId ?? null,
      photoUrl: entry.updatedByPhotoUrl ?? null
    });

    return {
      id: entry.id,
      organizationId: entry.organizationId,
      projectId: entry.projectId,
      parentId: entry.parentId,
      title: entry.title,
      slug: entry.slug,
      revision: this.buildRevisionToken(entry.updatedAt),
      contentMarkdown: entry.contentMarkdown,
      position: entry.position,
      createdBy: entry.createdBy,
      updatedBy: entry.updatedBy,
      updatedByDisplayName: entry.updatedByDisplayName ?? null,
      updatedByPhotoUrl,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    };
  }

  private toSidebarDto(
    entry: Omit<PersistedContentEntry, 'contentMarkdown' | 'createdBy' | 'createdAt'>,
    photoUrlByUserId: ReadonlyMap<number, string | null>
  ): ContentSidebarEntryDtoShape {
    return {
      id: entry.id,
      organizationId: entry.organizationId,
      projectId: entry.projectId,
      parentId: entry.parentId,
      title: entry.title,
      slug: entry.slug,
      position: entry.position,
      updatedBy: entry.updatedBy,
      updatedByDisplayName: entry.updatedByDisplayName ?? null,
      updatedByPhotoUrl: photoUrlByUserId.get(entry.updatedBy) ?? null,
      updatedAt: entry.updatedAt
    };
  }

  private toCommentDto(
    comment: {
      id: number;
      contentEntryId: number;
      authorUserId: number;
      authorDisplayName: string | null;
      bodyMarkdown: string;
      createdAt: Date;
      updatedAt: Date;
    },
    currentUserId: number,
    roles: readonly string[] | undefined,
    photoUrlByUserId: ReadonlyMap<number, string | null>
  ): ContentCommentDtoShape {
    return {
      id: comment.id,
      contentEntryId: comment.contentEntryId,
      authorUserId: comment.authorUserId,
      authorDisplayName: comment.authorDisplayName ?? null,
      authorPhotoUrl: photoUrlByUserId.get(comment.authorUserId) ?? null,
      bodyMarkdown: comment.bodyMarkdown,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      canDelete: this.canDeleteComment(comment.authorUserId, currentUserId, roles)
    };
  }

  private toAttachmentDto(attachment: {
    id: number;
    contentEntryId: number;
    fileId: number;
    attachedByUserId: number;
    attachedByDisplayName: string | null;
    uploadedByUserId: number | null;
    originalFilename: string;
    mimeType: string | null;
    byteSize: number;
    status: ContentAttachmentDtoShape['status'];
    visibility: ContentAttachmentDtoShape['visibility'];
    storageInstance: string | null;
    bucket: string | null;
    objectKey: string | null;
    createdAt: Date;
  }): ContentAttachmentDtoShape {
    return {
      id: attachment.id,
      contentEntryId: attachment.contentEntryId,
      fileId: attachment.fileId,
      attachedByUserId: attachment.attachedByUserId,
      attachedByDisplayName: attachment.attachedByDisplayName,
      uploadedByUserId: attachment.uploadedByUserId,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize,
      status: attachment.status,
      visibility: attachment.visibility,
      storageInstance: attachment.storageInstance,
      bucket: attachment.bucket,
      objectKey: attachment.objectKey,
      createdAt: attachment.createdAt
    };
  }

  private buildRevisionToken(value: string | Date): string {
    return new Date(value).toISOString();
  }

  private async resolvePhotoUrlsByUserId(
    tenantId: number,
    users: Array<{ userId: number; avatarFileId: number | null; photoUrl: string | null }>
  ): Promise<ReadonlyMap<number, string | null>> {
    const byUserId = new Map<number, { avatarFileId: number | null; photoUrl: string | null }>();
    for (const user of users) {
      if (!byUserId.has(user.userId)) {
        byUserId.set(user.userId, {
          avatarFileId: user.avatarFileId,
          photoUrl: user.photoUrl
        });
      }
    }

    return this.avatarUrlResolver.resolvePhotoUrls(
      String(tenantId),
      Array.from(byUserId.entries(), ([userId, value]) => ({
        id: userId,
        avatarFileId: value.avatarFileId,
        photoUrl: value.photoUrl
      }))
    );
  }

  private canDeleteComment(
    authorUserId: number,
    currentUserId: number,
    roles: readonly string[] | undefined
  ): boolean {
    if (authorUserId === currentUserId) {
      return true;
    }

    if (!roles) {
      return false;
    }

    return (
      roles.includes(TENANT_ROLE.ADMIN) ||
      roles.includes(TENANT_ROLE.OWNER) ||
      this.hasSystemAdminScope(roles)
    );
  }

  private hasSystemAdminScope(roles: readonly string[] | undefined): boolean {
    if (!roles) {
      return false;
    }

    return roles.includes(SYSTEM_ROLE.ADMIN) || roles.includes(SYSTEM_ROLE.OWNER);
  }

  private parseNumericId(value: string | number, field: string): number {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return Number.parseInt(value, 10);
    }

    throw Errors.validationinvalidValueFor002({ field, expectedType: 'integer' });
  }

  private parseOptionalNumericId(value: string | number | undefined, field: string): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    return this.parseNumericId(value, field);
  }

  private assertAttachableContentFile(file: DbFile, userId: number): void {
    if (file.deletedAt !== null || file.purgedAt !== null) {
      throw ApiException.requestValidationFailed('fileId', 'file is no longer available');
    }

    if (file.status !== 'ready') {
      throw ApiException.requestValidationFailed('fileId', 'file must be ready before attachment');
    }

    if (file.purpose !== 'content_upload') {
      throw ApiException.requestValidationFailed('fileId', 'file purpose must be content_upload');
    }

    if (file.uploadedByUserId !== userId) {
      throw ApiException.requestValidationFailed(
        'fileId',
        'file must be uploaded by the current user before attachment'
      );
    }
  }

  private parseNonNegativeInteger(value: number, field: string): number {
    if (Number.isInteger(value) && value >= 0) {
      return value;
    }

    throw Errors.validationinvalidValueFor002({ field, expectedType: 'integer' });
  }

  private async resolveCreatePlacement(
    database: NodePgDatabase,
    tenantId: number,
    projectId: number | null,
    parentId: number | null,
    createDto: CreateContentEntryDto
  ): Promise<{ siblingCount: number; targetPosition: number }> {
    const siblings = await this.contentRepository.listActiveSiblingsWithDatabase(
      database,
      tenantId,
      projectId,
      parentId,
      true
    );
    const requestedPosition =
      createDto.position === undefined
        ? siblings.length
        : this.parseNonNegativeInteger(createDto.position, 'position');

    return {
      siblingCount: siblings.length,
      targetPosition: Math.min(requestedPosition, siblings.length)
    };
  }

  private async resolveTargetPosition(
    database: NodePgDatabase,
    params: {
      tenantId: number;
      existingEntry: PersistedContentEntry;
      nextParentId: number | null;
      requestedPosition: number;
      lockForUpdate: boolean;
    }
  ): Promise<number> {
    const siblings = await this.contentRepository.listActiveSiblingsWithDatabase(
      database,
      params.tenantId,
      params.existingEntry.projectId,
      params.nextParentId,
      params.lockForUpdate
    );
    const siblingCountExcludingCurrent = siblings.filter(
      (entry) => entry.id !== params.existingEntry.id
    ).length;

    return Math.min(params.requestedPosition, siblingCountExcludingCurrent);
  }

  private async reorderEntriesForMove(
    database: NodePgDatabase,
    params: {
      tenantId: number;
      updatedBy: number;
      updatedAt: Date;
      existingEntry: PersistedContentEntry;
      nextParentId: number | null;
      targetPosition: number;
    }
  ): Promise<void> {
    const sourceSiblings = await this.contentRepository.listActiveSiblingsWithDatabase(
      database,
      params.tenantId,
      params.existingEntry.projectId,
      params.existingEntry.parentId,
      true
    );

    if (params.existingEntry.parentId === params.nextParentId) {
      const reorderedIds = sourceSiblings
        .filter((entry) => entry.id !== params.existingEntry.id)
        .map((entry) => entry.id);
      reorderedIds.splice(params.targetPosition, 0, params.existingEntry.id);

      await this.contentRepository.updateSiblingPositionsWithDatabase(
        database,
        params.tenantId,
        reorderedIds,
        params.updatedBy,
        params.updatedAt
      );
      return;
    }

    const sourceIds = sourceSiblings
      .filter((entry) => entry.id !== params.existingEntry.id)
      .map((entry) => entry.id);
    const destinationIds = (
      await this.contentRepository.listActiveSiblingsWithDatabase(
        database,
        params.tenantId,
        params.existingEntry.projectId,
        params.nextParentId,
        true
      )
    ).map((entry) => entry.id);

    destinationIds.splice(params.targetPosition, 0, params.existingEntry.id);

    await this.contentRepository.updateSiblingPositionsWithDatabase(
      database,
      params.tenantId,
      sourceIds,
      params.updatedBy,
      params.updatedAt
    );
    await this.contentRepository.updateWithDatabase(
      database,
      params.tenantId,
      params.existingEntry.id,
      {
        parentId: params.nextParentId,
        position: destinationIds.length + 1_000,
        updatedBy: params.updatedBy,
        updatedAt: params.updatedAt
      }
    );
    await this.contentRepository.updateSiblingPositionsWithDatabase(
      database,
      params.tenantId,
      destinationIds,
      params.updatedBy,
      params.updatedAt
    );
  }

  private async resolveScopeFilters(params: {
    tenantId: number;
    userId: number;
    roles?: readonly string[];
    scope?: ContentQueryScope;
    projectId?: string | number;
    parentId?: string | number;
  }): Promise<{
    effectiveProjectId: number | null | undefined;
    parentId: number | null | undefined;
  }> {
    const parentId =
      params.parentId === undefined
        ? undefined
        : this.parseOptionalNumericId(params.parentId, 'parentId');
    const requestedProjectId =
      params.projectId === undefined
        ? undefined
        : this.parseOptionalNumericId(params.projectId, 'projectId');

    if (params.scope === ContentQueryScope.ORGANIZATION) {
      if (requestedProjectId !== undefined) {
        throw ApiException.requestValidationFailed(
          'projectId',
          'organization scope cannot include projectId'
        );
      }

      if (parentId !== undefined && parentId !== null) {
        await this.contentRepository.ensureParentInSameScope(params.tenantId, parentId, null);
      }

      return { effectiveProjectId: null, parentId };
    }

    const parentEntry =
      parentId === undefined || parentId === null
        ? null
        : requestedProjectId === undefined
          ? await this.contentRepository.findByIdOrThrow(params.tenantId, parentId)
          : await this.contentRepository.ensureParentInSameScope(
              params.tenantId,
              parentId,
              requestedProjectId
            );

    const effectiveProjectId = requestedProjectId ?? parentEntry?.projectId;

    if (params.scope === ContentQueryScope.PROJECT && effectiveProjectId == null) {
      throw ApiException.requestValidationFailed(
        'scope',
        'project scope requires a visible project context'
      );
    }

    await this.assertProjectReadable(params.tenantId, effectiveProjectId, {
      userId: params.userId,
      roles: params.roles
    });

    return { effectiveProjectId, parentId };
  }

  private async resolveScopedProjectId(params: {
    tenantId: number;
    userId: number;
    roles?: readonly string[];
    scope?: ContentQueryScope;
    projectId?: string | number;
  }): Promise<number | null> {
    const requestedProjectId =
      params.projectId === undefined
        ? undefined
        : this.parseOptionalNumericId(params.projectId, 'projectId');

    if (params.scope === ContentQueryScope.ORGANIZATION) {
      if (requestedProjectId !== undefined) {
        throw ApiException.requestValidationFailed(
          'projectId',
          'organization scope cannot include projectId'
        );
      }

      return null;
    }

    if (params.scope === ContentQueryScope.PROJECT && requestedProjectId == null) {
      throw ApiException.requestValidationFailed(
        'scope',
        'project scope requires a visible project context'
      );
    }

    await this.assertProjectReadable(params.tenantId, requestedProjectId, {
      userId: params.userId,
      roles: params.roles
    });

    return requestedProjectId ?? null;
  }

  private async assertProjectReadable(
    tenantId: number,
    projectId: number | null | undefined,
    actor: ProjectActorContext
  ): Promise<void> {
    if (projectId === null || projectId === undefined) {
      return;
    }

    await this.projectRepository.findVisibleByIdOrThrow(tenantId, projectId, actor);
  }
}
