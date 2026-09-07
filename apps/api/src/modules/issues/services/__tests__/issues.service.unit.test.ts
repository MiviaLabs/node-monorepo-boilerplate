import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';

import { IssuesService } from '../issues.service';

type IssueRepositoryDouble = {
  createWithDatabase: jest.Mock;
  listVisibleIssues: jest.Mock;
  getNextIssueNumber: jest.Mock;
  getNextPosition: jest.Mock;
  findVisibleIssueByIdOrThrow: jest.Mock;
  findByIdOrThrow: jest.Mock;
  findByIdOrThrowWithDatabase: jest.Mock;
  summarizeVisibleIssues: jest.Mock;
  countCommentsByIssueIds: jest.Mock;
  countAttachmentsByIssueIds: jest.Mock;
  countWatchersByIssueIds: jest.Mock;
  countSubtasksByIssueIds: jest.Mock;
  listVisibleSubtasksByParentIssueId: jest.Mock;
  listActiveIssueTreeIdsWithDatabase: jest.Mock;
  softDeleteWithDatabase: jest.Mock;
  softDeleteByIdsWithDatabase: jest.Mock;
  clearParentIssueForChildIssuesWithDatabase: jest.Mock;
  updateWithDatabase: jest.Mock;
};

type SimpleRepositoryDouble = {
  createWithDatabase?: jest.Mock;
  deleteWithDatabase?: jest.Mock;
  updateWithDatabase?: jest.Mock;
  softDeleteWithDatabase?: jest.Mock;
  softDeleteByIssueIdsWithDatabase?: jest.Mock;
  createAssignmentWithDatabase?: jest.Mock;
  deleteAssignmentWithDatabase?: jest.Mock;
  deleteAssignmentsByIssueIdsWithDatabase?: jest.Mock;
  deleteByIssueIdsWithDatabase?: jest.Mock;
  assertAssignableOrganizationMember?: jest.Mock;
  isProjectMember?: jest.Mock;
  listMembershipProjectIds?: jest.Mock;
  listByIssueIds: jest.Mock;
  listByIssueId: jest.Mock;
  listVisibleLabels?: jest.Mock;
  findByNormalizedName?: jest.Mock;
  findVisibleByIdOrThrow: jest.Mock;
};

type IssueAttachmentRepositoryDouble = {
  listByIssueId: jest.Mock;
  listActiveByIssueIdsWithDatabase?: jest.Mock;
  findActiveByIdWithDatabase: jest.Mock;
  findByIdWithDatabase: jest.Mock;
  findActiveByFileIdWithDatabase: jest.Mock;
  createWithDatabase: jest.Mock;
  softDeleteByIdWithDatabase: jest.Mock;
  softDeleteByIssueIdsWithDatabase: jest.Mock;
};

type FileRepositoryDouble = {
  findByIdOrThrowWithDatabase: jest.Mock;
  findByIdIncludingDeletedOrThrowWithDatabase: jest.Mock;
  countActiveReferencesWithDatabase: jest.Mock;
  markPendingDeleteWithDatabase: jest.Mock;
  touchLastAccessedAtWithDatabase: jest.Mock;
};

type ProjectRepositoryDouble = {
  findVisibleByIdOrThrow: jest.Mock;
  listVisibleProjects: jest.Mock;
  listByIssueIds: jest.Mock;
  listByIssueId: jest.Mock;
};

const buildVisibleIssue = (
  overrides: {
    projectId?: number | null;
    projectVisibility?: 'private' | 'public' | null;
  } = {}
) =>
  ({
    id: 77,
    issueNumber: 142,
    projectId: 12,
    projectVisibility: 'private',
    ...overrides
  }) as const;

describe('IssuesService', () => {
  let service: IssuesService;
  let issueRepository: IssueRepositoryDouble;
  let issueAssigneeRepository: SimpleRepositoryDouble;
  let issueAttachmentRepository: IssueAttachmentRepositoryDouble;
  let issueLabelRepository: SimpleRepositoryDouble;
  let issueCommentRepository: SimpleRepositoryDouble;
  let issueWatcherRepository: SimpleRepositoryDouble;
  let issueRelationRepository: SimpleRepositoryDouble;
  let issueActivityRepository: SimpleRepositoryDouble;
  let projectMemberRepository: SimpleRepositoryDouble;
  let projectRepository: ProjectRepositoryDouble;
  let projectsService: {
    listProjects: jest.Mock;
    listProjectMembersBulk: jest.Mock;
    listProjectMembers: jest.Mock;
  };
  let tenantService: { getMembers: jest.Mock };
  let fileRepository: FileRepositoryDouble;
  let storageFilesService: { createUploadReservation: jest.Mock };
  let storageRegistry: { get: jest.Mock };
  let auditOutbox: { insert: jest.Mock };
  let avatarUrlResolver: {
    resolvePhotoUrl: (...args: unknown[]) => Promise<string | null>;
    resolvePhotoUrls: (...args: unknown[]) => Promise<ReadonlyMap<number, string | null>>;
  };
  let db: { transaction: (...args: unknown[]) => Promise<unknown> };
  let tx: { execute: jest.Mock };

  beforeEach(() => {
    issueRepository = {
      createWithDatabase: jest.fn(async () => ({
        id: 78,
        organizationId: 5,
        projectId: 12,
        parentIssueId: null,
        issueNumber: 143,
        title: 'Created issue',
        descriptionMarkdown: '',
        status: 'backlog',
        priority: 'medium',
        position: 0,
        estimate: null,
        dueAt: null,
        resolvedAt: null,
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-22T00:00:00.000Z'),
        updatedAt: new Date('2026-03-22T00:00:00.000Z'),
        deletedAt: null
      })),
      listVisibleIssues: jest.fn(async () => ({ data: [], total: 0 })),
      getNextIssueNumber: jest.fn(async () => 143),
      getNextPosition: jest.fn(async () => 0),
      findVisibleIssueByIdOrThrow: jest.fn(async () => ({
        id: 77,
        organizationId: 5,
        projectId: 12,
        parentIssueId: null,
        issueNumber: 142,
        title: 'Restore standalone issue details page',
        descriptionMarkdown: 'Bring the old detail route back.',
        status: 'in_progress',
        priority: 'high',
        position: 1,
        estimate: 5,
        dueAt: null,
        resolvedAt: null,
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-22T03:15:00.000Z'),
        projectName: 'Atlas',
        projectVisibility: 'private'
      })),
      findByIdOrThrow: jest.fn(async () => ({
        id: 73,
        organizationId: 5,
        projectId: 12
      })),
      findByIdOrThrowWithDatabase: jest.fn(async () => ({
        id: 77,
        organizationId: 5,
        projectId: 12,
        parentIssueId: null,
        issueNumber: 142,
        title: 'Restore standalone issue details page',
        descriptionMarkdown: 'Bring the old detail route back.',
        status: 'in_progress',
        priority: 'high',
        position: 1,
        estimate: 5,
        dueAt: null,
        resolvedAt: null,
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-22T03:15:00.000Z'),
        deletedAt: null
      })),
      summarizeVisibleIssues: jest.fn(async () => ({
        total: 4,
        backlog: 1,
        inProgress: 2,
        blocked: 1,
        done: 0
      })),
      countCommentsByIssueIds: jest.fn(async () => new Map([[77, 3]])),
      countAttachmentsByIssueIds: jest.fn(async () => new Map([[77, 1]])),
      countWatchersByIssueIds: jest.fn(async () => new Map([[77, 2]])),
      countSubtasksByIssueIds: jest.fn(async () => new Map([[77, { total: 4, done: 1 }]])),
      listVisibleSubtasksByParentIssueId: jest.fn(async () => []),
      listActiveIssueTreeIdsWithDatabase: jest.fn(async () => [77, 88, 89]),
      softDeleteWithDatabase: jest.fn(async () => ({
        id: 77,
        issueNumber: 142
      })),
      softDeleteByIdsWithDatabase: jest.fn(async () => [
        { id: 77, issueNumber: 142 },
        { id: 88, issueNumber: 188 },
        { id: 89, issueNumber: 189 }
      ]),
      clearParentIssueForChildIssuesWithDatabase: jest.fn(async () => 1),
      updateWithDatabase: jest.fn(async () => ({
        id: 77,
        organizationId: 5,
        projectId: 12,
        parentIssueId: null,
        issueNumber: 142,
        title: 'Restore standalone issue details page',
        descriptionMarkdown: 'Bring the old detail route back.',
        status: 'done',
        priority: 'medium',
        position: 2,
        estimate: 5,
        dueAt: null,
        resolvedAt: new Date('2026-03-22T04:00:00.000Z'),
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-22T04:00:00.000Z'),
        deletedAt: null
      }))
    };
    issueAssigneeRepository = {
      createWithDatabase: jest.fn(async () => undefined),
      deleteWithDatabase: jest.fn(async () => undefined),
      deleteByIssueIdsWithDatabase: jest.fn(async () => 2),
      assertAssignableOrganizationMember: jest.fn(),
      isProjectMember: jest.fn(async () => true),
      listByIssueIds: jest.fn(async () => [
        {
          issueId: 77,
          userId: 9,
          displayName: 'Jordan Lee',
          avatarFileId: 901,
          photoUrl: null
        }
      ]),
      listByIssueId: jest.fn(async () => [
        {
          issueId: 77,
          userId: 9,
          displayName: 'Jordan Lee',
          avatarFileId: 901,
          photoUrl: null
        }
      ]),
      findVisibleByIdOrThrow: jest.fn()
    };
    issueAttachmentRepository = {
      listByIssueId: jest.fn(async () => [
        {
          id: 51,
          issueId: 77,
          uploadedByUserId: 9,
          uploaderDisplayName: 'Jordan Lee',
          uploaderAvatarFileId: 901,
          uploaderPhotoUrl: null,
          fileId: 101,
          originalFilename: 'design-spec.pdf',
          mimeType: 'application/pdf',
          byteSize: 1024,
          status: 'ready',
          visibility: 'private',
          storageInstance: 'uploads',
          bucket: 'app-uploads',
          objectKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
          createdAt: new Date('2026-03-22T04:45:00.000Z')
        }
      ]),
      findActiveByIdWithDatabase: jest.fn(async () => ({
        id: 51,
        issueId: 77,
        uploadedByUserId: 9,
        fileId: 101,
        storageKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        createdAt: new Date('2026-03-22T04:45:00.000Z'),
        deletedAt: null
      })),
      findByIdWithDatabase: jest.fn(async () => ({
        id: 51,
        issueId: 77,
        uploadedByUserId: 9,
        fileId: 101,
        storageKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        createdAt: new Date('2026-03-22T04:45:00.000Z'),
        deletedAt: null
      })),
      findActiveByFileIdWithDatabase: jest.fn(async () => null),
      createWithDatabase: jest.fn(async () => ({
        id: 51,
        organizationId: 5,
        issueId: 77,
        uploadedByUserId: 9,
        fileId: 101,
        storageKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        createdAt: new Date('2026-03-22T04:45:00.000Z'),
        deletedAt: null
      })),
      softDeleteByIdWithDatabase: jest.fn(async () => ({
        id: 51,
        issueId: 77,
        uploadedByUserId: 9,
        fileId: 101,
        storageKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        createdAt: new Date('2026-03-22T04:45:00.000Z'),
        deletedAt: new Date('2026-03-23T04:45:00.000Z')
      })),
      softDeleteByIssueIdsWithDatabase: jest.fn(async () => [
        {
          id: 51,
          issueId: 77,
          uploadedByUserId: 9,
          fileId: 101,
          storageKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
          originalFilename: 'design-spec.pdf',
          mimeType: 'application/pdf',
          byteSize: 1024,
          createdAt: new Date('2026-03-22T04:45:00.000Z'),
          deletedAt: new Date('2026-03-23T04:45:00.000Z')
        },
        {
          id: 52,
          issueId: 88,
          uploadedByUserId: 9,
          fileId: 102,
          storageKey: 'org/5/uploads/issue_attachment/102/subtask-doc.pdf',
          originalFilename: 'subtask-doc.pdf',
          mimeType: 'application/pdf',
          byteSize: 2048,
          createdAt: new Date('2026-03-22T04:55:00.000Z'),
          deletedAt: new Date('2026-03-23T04:55:00.000Z')
        }
      ])
    };
    issueLabelRepository = {
      listByIssueIds: jest.fn(async () => [
        {
          issueId: 77,
          id: 3,
          name: 'Frontend',
          color: '#38bdf8',
          description: 'Browser-facing changes',
          projectId: null
        }
      ]),
      listByIssueId: jest.fn(async () => [
        {
          id: 3,
          name: 'Frontend',
          color: '#38bdf8',
          description: 'Browser-facing changes',
          projectId: null
        }
      ]),
      listVisibleLabels: jest.fn(async () => [
        {
          id: 3,
          name: 'Frontend',
          color: '#38bdf8',
          description: 'Browser-facing changes',
          projectId: null
        }
      ]),
      findByNormalizedName: jest.fn(async () => null),
      findVisibleByIdOrThrow: jest.fn(async () => ({
        id: 3,
        name: 'Frontend',
        color: '#38bdf8',
        description: 'Browser-facing changes',
        projectId: null
      })),
      createAssignmentWithDatabase: jest.fn(async () => undefined),
      deleteAssignmentWithDatabase: jest.fn(async () => undefined),
      createWithDatabase: jest.fn(async () => ({
        id: 3,
        organizationId: 5,
        projectId: null,
        name: 'Frontend',
        color: '#38bdf8',
        description: 'Browser-facing changes',
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-22T04:30:00.000Z'),
        updatedAt: new Date('2026-03-22T04:30:00.000Z'),
        deletedAt: null
      })),
      updateWithDatabase: jest.fn(async () => ({
        id: 3,
        organizationId: 5,
        projectId: null,
        name: 'Platform',
        color: '#38bdf8',
        description: 'Browser-facing changes',
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-22T04:30:00.000Z'),
        updatedAt: new Date('2026-03-22T05:00:00.000Z'),
        deletedAt: null
      })),
      softDeleteWithDatabase: jest.fn(async () => ({
        id: 3,
        name: 'Frontend'
      })),
      deleteAssignmentsByIssueIdsWithDatabase: jest.fn(async () => 2)
    };
    issueCommentRepository = {
      createWithDatabase: jest.fn(async () => ({
        id: 12,
        issueId: 77,
        authorUserId: 9,
        parentCommentId: null,
        bodyMarkdown: 'Looks good.',
        createdAt: new Date('2026-03-22T04:30:00.000Z'),
        updatedAt: new Date('2026-03-22T04:30:00.000Z')
      })),
      listByIssueId: jest.fn(async () => [
        {
          id: 11,
          authorUserId: 9,
          authorDisplayName: 'Jordan Lee',
          authorAvatarFileId: 901,
          authorPhotoUrl: null,
          bodyMarkdown: 'Need payload confirmation.',
          createdAt: new Date('2026-03-22T02:00:00.000Z'),
          updatedAt: new Date('2026-03-22T02:00:00.000Z')
        }
      ]),
      listByIssueIds: jest.fn(),
      findVisibleByIdOrThrow: jest.fn(),
      softDeleteByIssueIdsWithDatabase: jest.fn(async () => 2)
    };
    issueCommentRepository.findVisibleByIdOrThrow = jest.fn(async () => ({
      id: 11,
      authorUserId: 9,
      authorDisplayName: 'Jordan Lee',
      bodyMarkdown: 'Need payload confirmation.',
      createdAt: new Date('2026-03-22T02:00:00.000Z'),
      updatedAt: new Date('2026-03-22T02:00:00.000Z')
    }));
    issueWatcherRepository = {
      createWithDatabase: jest.fn(async () => undefined),
      deleteWithDatabase: jest.fn(async () => undefined),
      listByIssueIds: jest.fn(async () => [
        {
          issueId: 77,
          userId: 10,
          displayName: 'Alex Kim',
          avatarFileId: null,
          photoUrl: 'https://legacy.example/alex.png'
        }
      ]),
      listByIssueId: jest.fn(async () => [
        {
          issueId: 77,
          userId: 10,
          displayName: 'Alex Kim',
          avatarFileId: null,
          photoUrl: 'https://legacy.example/alex.png'
        }
      ]),
      findVisibleByIdOrThrow: jest.fn(),
      deleteByIssueIdsWithDatabase: jest.fn(async () => 2)
    };
    issueRelationRepository = {
      listByIssueId: jest.fn(async () => ({
        rows: [
          {
            id: 51,
            relation_type: 'blocks',
            related_issue_id: 91,
            related_issue_title: 'Ship issue API reads',
            related_issue_number: 151
          }
        ]
      })),
      listByIssueIds: jest.fn(),
      findVisibleByIdOrThrow: jest.fn(),
      deleteByIssueIdsWithDatabase: jest.fn(async () => 2)
    };
    issueActivityRepository = {
      createWithDatabase: jest.fn(async () => ({
        id: 62,
        issueId: 77,
        actorUserId: 9,
        activityType: 'issue.comment_added',
        metadataJson: { bodyPreview: 'Looks good.' },
        createdAt: new Date('2026-03-22T04:30:00.000Z')
      })),
      listByIssueId: jest.fn(async () => [
        {
          id: 61,
          activityType: 'issue.created',
          actorUserId: 9,
          actorDisplayName: 'Jordan Lee',
          actorAvatarFileId: 901,
          actorPhotoUrl: null,
          metadata: { issueNumber: 142 },
          createdAt: new Date('2026-03-22T01:00:00.000Z')
        }
      ]),
      listByIssueIds: jest.fn(async () => [
        {
          issueId: 77,
          id: 61,
          activityType: 'issue.created',
          actorUserId: 9,
          actorDisplayName: 'Jordan Lee',
          actorAvatarFileId: 901,
          actorPhotoUrl: null,
          metadata: { issueNumber: 142 },
          createdAt: new Date('2026-03-22T01:00:00.000Z')
        }
      ]),
      findVisibleByIdOrThrow: jest.fn(),
      deleteByIssueIdsWithDatabase: jest.fn(async () => 3)
    };
    projectMemberRepository = {
      assertAssignableOrganizationMember: jest.fn(async () => undefined),
      isProjectMember: jest.fn(async () => true),
      listMembershipProjectIds: jest.fn(async () => [12]),
      listByIssueIds: jest.fn(),
      listByIssueId: jest.fn(),
      findVisibleByIdOrThrow: jest.fn()
    };
    projectRepository = {
      findVisibleByIdOrThrow: jest.fn(async () => ({})),
      listVisibleProjects: jest.fn(async () => ({
        data: [
          {
            id: 12,
            organizationId: 5,
            createdBy: 9,
            key: 'ATL',
            name: 'Atlas',
            visibility: 'private'
          }
        ],
        total: 1
      })),
      listByIssueIds: jest.fn(),
      listByIssueId: jest.fn()
    };
    projectsService = {
      listProjects: jest.fn(async () => ({
        data: [
          {
            id: 12,
            organizationId: 5,
            createdBy: 9,
            key: 'ATL',
            name: 'Atlas',
            visibility: 'private',
            isMember: true
          }
        ],
        metadata: {
          pagination: {
            page: 1,
            pageSize: 100,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false
          }
        }
      })),
      listProjectMembersBulk: jest.fn(async () => ({
        '12': [
          {
            userId: 9,
            displayName: 'Jordan Lee',
            photoUrl: 'https://cdn.example/jordan-avatar.png',
            isCreator: true,
            assignedAt: '2026-03-21T00:00:00.000Z'
          }
        ]
      })),
      listProjectMembers: jest.fn(async () => [
        {
          userId: 9,
          displayName: 'Jordan Lee',
          photoUrl: 'https://cdn.example/jordan-avatar.png',
          isCreator: true,
          assignedAt: '2026-03-21T00:00:00.000Z'
        }
      ])
    };
    tenantService = {
      getMembers: jest.fn(async () => ({
        data: [
          {
            userId: '9',
            email: 'jordan@example.com',
            displayName: 'Jordan Lee',
            photoUrl: 'https://cdn.example/jordan-avatar.png',
            joinedAt: '2026-03-21T00:00:00.000Z'
          }
        ],
        metadata: {
          pagination: {
            page: 1,
            pageSize: 100,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false
          }
        }
      }))
    };
    fileRepository = {
      findByIdOrThrowWithDatabase: jest.fn(async () => ({
        id: 101,
        organizationId: 5,
        uploadedByUserId: 9,
        storageInstance: 'uploads',
        bucket: 'app-uploads',
        objectKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        checksumSha256: null,
        etag: null,
        status: 'ready',
        visibility: 'private',
        purpose: 'issue_attachment',
        metadata: {},
        uploadedAt: new Date('2026-03-22T04:44:00.000Z'),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date('2026-03-22T04:43:00.000Z'),
        updatedAt: new Date('2026-03-22T04:44:00.000Z')
      })),
      findByIdIncludingDeletedOrThrowWithDatabase: jest.fn(async () => ({
        id: 101,
        organizationId: 5,
        uploadedByUserId: 9,
        storageInstance: 'uploads',
        bucket: 'app-uploads',
        objectKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        checksumSha256: null,
        etag: null,
        status: 'ready',
        visibility: 'private',
        purpose: 'issue_attachment',
        metadata: { source: 'issues-ui', issueId: 77, projectId: 12 },
        uploadedAt: new Date('2026-03-22T04:44:00.000Z'),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date('2026-03-22T04:43:00.000Z'),
        updatedAt: new Date('2026-03-22T04:44:00.000Z')
      })),
      countActiveReferencesWithDatabase: jest.fn(async () => ({
        avatarCount: 0,
        issueAttachmentCount: 0,
        contentAttachmentCount: 0,
        total: 0
      })),
      touchLastAccessedAtWithDatabase: jest.fn(async () => undefined),
      markPendingDeleteWithDatabase: jest.fn(async (_database, tenantId, fileId, deletedAt) => ({
        id: fileId,
        organizationId: tenantId,
        uploadedByUserId: 9,
        storageInstance: 'uploads',
        bucket: 'app-uploads',
        objectKey: `org/5/uploads/issue_attachment/${String(fileId)}/attachment.pdf`,
        originalFilename: fileId === 101 ? 'design-spec.pdf' : 'subtask-doc.pdf',
        mimeType: 'application/pdf',
        byteSize: fileId === 101 ? 1024 : 2048,
        checksumSha256: null,
        etag: null,
        status: 'pending_delete',
        visibility: 'private',
        purpose: 'issue_attachment',
        metadata: { source: 'issues-ui', issueId: fileId === 101 ? 77 : 88, projectId: 12 },
        uploadedAt: new Date('2026-03-22T04:44:00.000Z'),
        lastAccessedAt: null,
        deletedAt,
        purgedAt: null,
        createdAt: new Date('2026-03-22T04:43:00.000Z'),
        updatedAt: deletedAt
      }))
    };
    storageFilesService = {
      createUploadReservation: jest.fn(async () => ({
        file: { id: 101, purpose: 'issue_attachment' },
        upload: { transport: 'api_proxy', url: '/v1/objects/uploads/101/content' }
      }))
    };
    storageRegistry = {
      get: jest.fn(() => ({
        getObject: jest.fn(async () => ({
          body: Readable.from([Buffer.from('payload')]),
          contentType: 'application/pdf',
          contentLength: 7,
          etag: '"etag-1"',
          lastModified: new Date('2026-03-22T04:46:00.000Z')
        }))
      }))
    };
    auditOutbox = { insert: jest.fn(async () => undefined) };
    avatarUrlResolver = {
      resolvePhotoUrl: jest.fn(async (...args: unknown[]) => {
        const [, user] = args as [string, unknown];
        const typedUser = user as { id: number; photoUrl: string | null };
        if (typedUser.id === 9) {
          return 'https://cdn.example/jordan-avatar.png';
        }

        return typedUser.photoUrl ?? null;
      }),
      resolvePhotoUrls: jest.fn(async (...args: unknown[]) => {
        const [, users] = args as [string, Array<{ id: number; photoUrl: string | null }>];
        return new Map(
          users.map((user) => [
            user.id,
            user.id === 9 ? 'https://cdn.example/jordan-avatar.png' : (user.photoUrl ?? null)
          ])
        );
      })
    };
    tx = {
      execute: jest.fn(async () => undefined)
    };
    db = {
      transaction: async (...args: unknown[]) => {
        const callback = args[0] as (tx: unknown) => Promise<unknown>;
        return callback(tx);
      }
    };

    service = new IssuesService(
      issueRepository as never,
      issueAttachmentRepository as never,
      issueAssigneeRepository as never,
      issueLabelRepository as never,
      issueCommentRepository as never,
      issueWatcherRepository as never,
      issueRelationRepository as never,
      issueActivityRepository as never,
      projectMemberRepository as never,
      projectRepository as never,
      projectsService as never,
      tenantService as never,
      fileRepository as never,
      storageFilesService as never,
      storageRegistry as never,
      auditOutbox as never,
      avatarUrlResolver as never,
      db as never
    );
  });

  it('lists issues and enriches them with counts and participants', async () => {
    issueRepository.listVisibleIssues.mockResolvedValue({
      data: [
        {
          id: 77,
          organizationId: 5,
          projectId: 12,
          parentIssueId: null,
          issueNumber: 142,
          title: 'Restore standalone issue details page',
          descriptionMarkdown: 'Bring the old detail route back.',
          status: 'in_progress',
          priority: 'high',
          position: 1,
          estimate: 5,
          dueAt: null,
          resolvedAt: null,
          createdBy: 9,
          updatedBy: 9,
          createdAt: new Date('2026-03-21T00:00:00.000Z'),
          updatedAt: new Date('2026-03-22T03:15:00.000Z'),
          projectName: 'Atlas',
          projectVisibility: 'private'
        }
      ],
      total: 1
    } as never);

    const result = await service.listIssues({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user'],
      page: 1,
      pageSize: 20
    });

    expect(result.metadata.pagination.total).toBe(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 77,
        commentsCount: 3,
        attachmentsCount: 1,
        watchersCount: 2,
        subtaskCount: 4,
        completedSubtaskCount: 1
      })
    );
    expect(result.data[0]?.assignees[0]?.displayName).toBe('Jordan Lee');
    expect(result.data[0]?.assignees[0]?.photoUrl).toBe('https://cdn.example/jordan-avatar.png');
    expect(result.data[0]?.labels[0]?.name).toBe('Frontend');
    expect(result.data[0]?.activity?.[0]).toEqual(
      expect.objectContaining({
        activityType: 'issue.created',
        actorDisplayName: 'Jordan Lee',
        actorPhotoUrl: 'https://cdn.example/jordan-avatar.png'
      })
    );
  });

  it('builds the workspace page payload with organization members and gated private project members', async () => {
    issueRepository.listVisibleIssues.mockResolvedValue({
      data: [
        {
          id: 77,
          organizationId: 5,
          projectId: 12,
          parentIssueId: null,
          issueNumber: 142,
          title: 'Restore standalone issue details page',
          descriptionMarkdown: 'Bring the old detail route back.',
          status: 'in_progress',
          priority: 'high',
          position: 1,
          estimate: 5,
          dueAt: null,
          resolvedAt: null,
          createdBy: 9,
          updatedBy: 9,
          createdAt: new Date('2026-03-21T00:00:00.000Z'),
          updatedAt: new Date('2026-03-22T03:15:00.000Z'),
          projectName: 'Atlas',
          projectVisibility: 'private'
        }
      ],
      total: 1
    } as never);

    const result = await service.getWorkspaceIssuesPage({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user']
    });

    expect(tenantService.getMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: '5',
        page: 1,
        pageSize: 100,
        status: 'active'
      })
    );
    expect(projectsService.listProjectMembersBulk).toHaveBeenCalledWith(
      '5',
      '9',
      ['tenant_user'],
      ['12']
    );
    expect(projectsService.listProjects).toHaveBeenCalledWith({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user'],
      page: 1,
      pageSize: 100,
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    });
    expect(result.organizationMembers[0]).toEqual(
      expect.objectContaining({
        userId: 9,
        displayName: 'Jordan Lee'
      })
    );
    expect(result.privateProjectMembersByProjectId['12']?.[0]).toEqual(
      expect.objectContaining({
        userId: 9,
        isCreator: true
      })
    );
  });

  it('builds the issue page payload from the aggregated issue page helper', async () => {
    const result = await service.getIssuePage('5', '9', ['tenant_user'], '77');

    expect(projectsService.listProjectMembers).toHaveBeenCalledWith(
      '5',
      '9',
      ['tenant_user'],
      '12'
    );
    expect(result.attachments[0]).toEqual(
      expect.objectContaining({
        id: 51,
        originalFilename: 'design-spec.pdf'
      })
    );
    expect(result.labels[0]).toEqual(
      expect.objectContaining({
        id: 3,
        name: 'Frontend'
      })
    );
    expect(Array.isArray(result.relationCandidates)).toBe(true);
  });

  it('builds my-work from three selectors with one shared enrichment pass', async () => {
    issueRepository.listVisibleIssues
      .mockResolvedValueOnce({
        data: [
          {
            id: 77,
            organizationId: 5,
            projectId: 12,
            parentIssueId: null,
            issueNumber: 142,
            title: 'Assigned issue',
            descriptionMarkdown: 'Assigned work',
            status: 'in_progress',
            priority: 'high',
            position: 1,
            estimate: 5,
            dueAt: null,
            resolvedAt: null,
            createdBy: 9,
            updatedBy: 9,
            createdAt: new Date('2026-03-21T00:00:00.000Z'),
            updatedAt: new Date('2026-03-22T03:15:00.000Z'),
            deletedAt: null,
            projectKey: 'ATL',
            projectName: 'Atlas',
            projectVisibility: 'private'
          }
        ],
        total: 4
      } as never)
      .mockResolvedValueOnce({
        data: [
          {
            id: 77,
            organizationId: 5,
            projectId: 12,
            parentIssueId: null,
            issueNumber: 142,
            title: 'Assigned issue',
            descriptionMarkdown: 'Assigned work',
            status: 'in_progress',
            priority: 'high',
            position: 1,
            estimate: 5,
            dueAt: null,
            resolvedAt: null,
            createdBy: 9,
            updatedBy: 9,
            createdAt: new Date('2026-03-21T00:00:00.000Z'),
            updatedAt: new Date('2026-03-22T03:15:00.000Z'),
            deletedAt: null,
            projectKey: 'ATL',
            projectName: 'Atlas',
            projectVisibility: 'private'
          },
          {
            id: 88,
            organizationId: 5,
            projectId: 12,
            parentIssueId: null,
            issueNumber: 188,
            title: 'Watching issue',
            descriptionMarkdown: 'Watcher work',
            status: 'backlog',
            priority: 'medium',
            position: 2,
            estimate: null,
            dueAt: null,
            resolvedAt: null,
            createdBy: 10,
            updatedBy: 10,
            createdAt: new Date('2026-03-20T00:00:00.000Z'),
            updatedAt: new Date('2026-03-22T02:00:00.000Z'),
            deletedAt: null,
            projectKey: 'ATL',
            projectName: 'Atlas',
            projectVisibility: 'private'
          }
        ],
        total: 2
      } as never)
      .mockResolvedValueOnce({
        data: [
          {
            id: 99,
            organizationId: 5,
            projectId: 12,
            parentIssueId: null,
            issueNumber: 199,
            title: 'Recent issue',
            descriptionMarkdown: 'Recent work',
            status: 'done',
            priority: 'low',
            position: 3,
            estimate: null,
            dueAt: null,
            resolvedAt: new Date('2026-03-22T01:00:00.000Z'),
            createdBy: 10,
            updatedBy: 9,
            createdAt: new Date('2026-03-19T00:00:00.000Z'),
            updatedAt: new Date('2026-03-22T01:00:00.000Z'),
            deletedAt: null,
            projectKey: 'ATL',
            projectName: 'Atlas',
            projectVisibility: 'private'
          },
          {
            id: 88,
            organizationId: 5,
            projectId: 12,
            parentIssueId: null,
            issueNumber: 188,
            title: 'Watching issue',
            descriptionMarkdown: 'Watcher work',
            status: 'backlog',
            priority: 'medium',
            position: 2,
            estimate: null,
            dueAt: null,
            resolvedAt: null,
            createdBy: 10,
            updatedBy: 10,
            createdAt: new Date('2026-03-20T00:00:00.000Z'),
            updatedAt: new Date('2026-03-22T02:00:00.000Z'),
            deletedAt: null,
            projectKey: 'ATL',
            projectName: 'Atlas',
            projectVisibility: 'private'
          }
        ],
        total: 2
      } as never);
    issueAssigneeRepository.listByIssueIds.mockResolvedValueOnce([
      { issueId: 77, userId: 9, displayName: 'Jordan Lee', avatarFileId: 901, photoUrl: null },
      { issueId: 88, userId: 10, displayName: 'Alex Kim', avatarFileId: null, photoUrl: null }
    ] as never);
    issueLabelRepository.listByIssueIds.mockResolvedValueOnce([
      {
        issueId: 77,
        id: 3,
        name: 'Frontend',
        color: '#38bdf8',
        description: 'Browser-facing changes',
        projectId: null
      },
      {
        issueId: 88,
        id: 4,
        name: 'Backend',
        color: '#f97316',
        description: 'Server-facing changes',
        projectId: null
      },
      {
        issueId: 99,
        id: 5,
        name: 'Ops',
        color: '#22c55e',
        description: 'Operations',
        projectId: null
      }
    ] as never);
    issueWatcherRepository.listByIssueIds.mockResolvedValueOnce([
      { issueId: 88, userId: 9, displayName: 'Jordan Lee', avatarFileId: 901, photoUrl: null },
      { issueId: 99, userId: 10, displayName: 'Alex Kim', avatarFileId: null, photoUrl: null }
    ] as never);
    issueActivityRepository.listByIssueIds.mockResolvedValueOnce([
      {
        issueId: 77,
        id: 61,
        activityType: 'issue.created',
        actorUserId: 9,
        actorDisplayName: 'Jordan Lee',
        actorAvatarFileId: 901,
        actorPhotoUrl: null,
        metadata: { issueNumber: 142 },
        createdAt: new Date('2026-03-22T01:00:00.000Z')
      },
      {
        issueId: 88,
        id: 62,
        activityType: 'issue.updated',
        actorUserId: 10,
        actorDisplayName: 'Alex Kim',
        actorAvatarFileId: null,
        actorPhotoUrl: null,
        metadata: { field: 'status' },
        createdAt: new Date('2026-03-22T02:00:00.000Z')
      }
    ] as never);
    issueRepository.countCommentsByIssueIds.mockResolvedValueOnce(
      new Map([
        [77, 3],
        [88, 1],
        [99, 0]
      ]) as never
    );
    issueRepository.countAttachmentsByIssueIds.mockResolvedValueOnce(
      new Map([
        [77, 1],
        [88, 2],
        [99, 0]
      ]) as never
    );
    issueRepository.countSubtasksByIssueIds.mockResolvedValueOnce(
      new Map([
        [77, { total: 4, done: 1 }],
        [88, { total: 0, done: 0 }],
        [99, { total: 2, done: 2 }]
      ]) as never
    );

    const result = await service.getMyWorkPage({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user']
    });

    expect(issueRepository.listVisibleIssues).toHaveBeenCalledTimes(3);
    expect(issueAssigneeRepository.listByIssueIds).toHaveBeenCalledTimes(1);
    expect(issueAssigneeRepository.listByIssueIds).toHaveBeenCalledWith(5, [77, 88, 99]);
    expect(issueLabelRepository.listByIssueIds).toHaveBeenCalledTimes(1);
    expect(issueWatcherRepository.listByIssueIds).toHaveBeenCalledTimes(1);
    expect(issueActivityRepository.listByIssueIds).toHaveBeenCalledTimes(1);
    expect(issueRepository.countCommentsByIssueIds).toHaveBeenCalledTimes(1);
    expect(issueRepository.countAttachmentsByIssueIds).toHaveBeenCalledTimes(1);
    expect(issueRepository.countSubtasksByIssueIds).toHaveBeenCalledTimes(1);
    expect(result.assignedIssueCount).toBe(4);
    expect(result.assignedIssues.map((issue) => issue.id)).toEqual([77]);
    expect(result.watchingIssues.map((issue) => issue.id)).toEqual([77, 88]);
    expect(result.recentIssues.map((issue) => issue.id)).toEqual([99, 88]);
    expect(result.watchingIssues[0]).toEqual(
      expect.objectContaining({
        id: 77,
        commentsCount: 3,
        attachmentsCount: 1,
        subtaskCount: 4,
        completedSubtaskCount: 1
      })
    );
    expect(result.recentIssues[0]).toEqual(
      expect.objectContaining({
        id: 99,
        commentsCount: 0,
        attachmentsCount: 0,
        subtaskCount: 2,
        completedSubtaskCount: 2,
        labels: [expect.objectContaining({ name: 'Ops' })]
      })
    );
  });

  it('validates explicit project scope before listing', async () => {
    await service.listIssues({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user'],
      projectId: 12
    });

    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(5, 12, {
      userId: 9,
      roles: ['tenant_user']
    });
  });

  it('passes assignee and watcher filters into visible issue reads and summaries', async () => {
    await service.listIssues({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user'],
      assigneeUserId: 9,
      watcherUserId: 10
    });
    await service.getIssuesSummary({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user'],
      assigneeUserId: 9,
      watcherUserId: 10
    });

    expect(issueRepository.listVisibleIssues).toHaveBeenCalledWith(
      5,
      { userId: 9, roles: ['tenant_user'] },
      expect.objectContaining({
        assigneeUserId: 9,
        watcherUserId: 10
      })
    );
    expect(issueRepository.summarizeVisibleIssues).toHaveBeenCalledWith(
      5,
      { userId: 9, roles: ['tenant_user'] },
      expect.objectContaining({
        assigneeUserId: 9,
        watcherUserId: 10
      })
    );
  });

  it('returns issue detail with nested comments, watchers, relations, and activity', async () => {
    const result = await service.getIssueById('5', '9', ['tenant_user'], '77');

    expect(result.id).toBe(77);
    expect(result.watchers).toEqual([
      {
        userId: 9,
        displayName: 'Jordan Lee',
        photoUrl: 'https://cdn.example/jordan-avatar.png'
      },
      {
        userId: 10,
        displayName: 'Alex Kim',
        photoUrl: 'https://legacy.example/alex.png'
      }
    ]);
    expect(result.comments[0]?.bodyMarkdown).toBe('Need payload confirmation.');
    expect(result.comments[0]?.authorPhotoUrl).toBe('https://cdn.example/jordan-avatar.png');
    expect(result.relations[0]?.relatedIssueId).toBe(91);
    expect(result.activity[0]?.activityType).toBe('issue.created');
    expect(result.activity[0]?.actorPhotoUrl).toBe('https://cdn.example/jordan-avatar.png');
  });

  it('lists issue activity for authorized readers', async () => {
    const result = await service.listIssueActivity('5', '9', ['tenant_user'], '77');

    expect(issueRepository.findVisibleIssueByIdOrThrow).toHaveBeenCalledWith(5, 77, {
      userId: 9,
      roles: ['tenant_user']
    });
    expect(issueActivityRepository.listByIssueId).toHaveBeenCalledWith(5, 77);
    expect(result[0]?.activityType).toBe('issue.created');
  });

  it('lists issue comments after validating issue visibility', async () => {
    const result = await service.listIssueComments('5', '9', ['tenant_user'], '77');

    expect(issueRepository.findVisibleIssueByIdOrThrow).toHaveBeenCalledWith(5, 77, {
      userId: 9,
      roles: ['tenant_user']
    });
    expect(issueCommentRepository.listByIssueId).toHaveBeenCalledWith(5, 77);
    expect(result[0]?.bodyMarkdown).toBe('Need payload confirmation.');
    expect(result[0]?.authorPhotoUrl).toBe('https://cdn.example/jordan-avatar.png');
  });

  it('lists issue attachments from the canonical file-backed read model', async () => {
    const result = await service.listIssueAttachments('5', '9', ['tenant_user'], '77');

    expect(issueRepository.findVisibleIssueByIdOrThrow).toHaveBeenCalledWith(5, 77, {
      userId: 9,
      roles: ['tenant_user']
    });
    expect(issueAttachmentRepository.listByIssueId).toHaveBeenCalledWith(5, 77);
    expect(result[0]).toEqual(
      expect.objectContaining({
        fileId: 101,
        originalFilename: 'design-spec.pdf',
        storageInstance: 'uploads',
        uploaderPhotoUrl: 'https://cdn.example/jordan-avatar.png'
      })
    );
  });

  it('lists assignees and effective watchers through dedicated service methods', async () => {
    const assignees = await service.listIssueAssignees('5', '9', ['tenant_user'], '77');
    const watchers = await service.listIssueWatchers('5', '9', ['tenant_user'], '77');

    expect(assignees).toEqual([
      {
        userId: 9,
        displayName: 'Jordan Lee',
        photoUrl: 'https://cdn.example/jordan-avatar.png'
      }
    ]);
    expect(watchers).toEqual([
      {
        userId: 9,
        displayName: 'Jordan Lee',
        photoUrl: 'https://cdn.example/jordan-avatar.png'
      },
      {
        userId: 10,
        displayName: 'Alex Kim',
        photoUrl: 'https://legacy.example/alex.png'
      }
    ]);
  });

  it('lists reusable labels for the tenant scope', async () => {
    const labels = await service.listIssueLabels('5', '9', ['tenant_user']);

    expect(issueLabelRepository.listVisibleLabels).toHaveBeenCalledWith(5, {
      userId: 9,
      roles: ['tenant_user']
    });
    expect(labels[0]?.description).toBe('Browser-facing changes');
  });

  it('locks issue-number generation during create to avoid concurrent tenant races', async () => {
    await service.createIssue('5', '9', 'actor-9', ['tenant_user'], {
      title: 'Created issue',
      projectId: 12
    });

    expect(tx.execute).toHaveBeenCalledWith(expect.anything());
    expect(issueRepository.getNextIssueNumber).toHaveBeenCalledWith(5);
  });

  it('validates parent issue scope on update before reparenting', async () => {
    issueRepository.findVisibleIssueByIdOrThrow
      .mockResolvedValueOnce({
        id: 77,
        organizationId: 5,
        projectId: 12,
        parentIssueId: null,
        issueNumber: 142,
        title: 'Restore standalone issue details page',
        descriptionMarkdown: 'Bring the old detail route back.',
        status: 'in_progress',
        priority: 'high',
        position: 1,
        estimate: 5,
        dueAt: null,
        resolvedAt: null,
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-22T03:15:00.000Z'),
        projectName: 'Atlas',
        projectVisibility: 'private'
      } as never)
      .mockResolvedValueOnce({
        id: 88,
        organizationId: 5,
        projectId: 13,
        parentIssueId: null,
        issueNumber: 143,
        title: 'Different project parent',
        descriptionMarkdown: '',
        status: 'backlog',
        priority: 'medium',
        position: 0,
        estimate: null,
        dueAt: null,
        resolvedAt: null,
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-22T03:15:00.000Z'),
        projectName: 'Other',
        projectVisibility: 'private'
      } as never);

    await expect(
      service.updateIssue('5', '9', 'actor-9', ['tenant_user'], '77', {
        parentIssueId: 88
      })
    ).rejects.toThrow('must remain within the same project scope');
  });

  it('rejects threaded comments whose parent belongs to another issue', async () => {
    issueCommentRepository.findVisibleByIdOrThrow = jest.fn(async () => {
      throw new Error('Issue comment not found');
    });

    await expect(
      service.createIssueComment('5', '9', 'actor-9', ['tenant_user'], '77', {
        bodyMarkdown: 'Replying to the wrong issue',
        parentCommentId: 999
      })
    ).rejects.toThrow('Issue comment not found');

    expect(issueCommentRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(tx, 5, 77, 999);
  });

  it('does not detach child issues when deleting an issue tree', async () => {
    await service.deleteIssue('5', '9', 'actor-9', ['tenant_user'], '77');

    expect(issueRepository.listActiveIssueTreeIdsWithDatabase).toHaveBeenCalledWith(tx, 5, 77);
    expect(issueRepository.clearParentIssueForChildIssuesWithDatabase).not.toHaveBeenCalled();
  });

  it('enriches subtasks with real counts and participants in issue detail', async () => {
    issueRepository.listVisibleSubtasksByParentIssueId.mockResolvedValueOnce([
      {
        id: 81,
        organizationId: 5,
        projectId: 12,
        parentIssueId: 77,
        issueNumber: 144,
        title: 'Nested subtask',
        descriptionMarkdown: 'Child issue details',
        status: 'done',
        priority: 'medium',
        position: 1,
        estimate: 1,
        dueAt: null,
        resolvedAt: new Date('2026-03-22T04:10:00.000Z'),
        createdBy: 9,
        updatedBy: 9,
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-22T04:10:00.000Z'),
        deletedAt: null,
        projectName: 'Atlas',
        projectVisibility: 'private'
      }
    ] as never);
    issueAssigneeRepository.listByIssueIds
      .mockResolvedValueOnce([{ issueId: 77, userId: 9, displayName: 'Jordan Lee' }] as never)
      .mockResolvedValueOnce([{ issueId: 81, userId: 10, displayName: 'Alex Kim' }] as never);
    issueLabelRepository.listByIssueIds
      .mockResolvedValueOnce([
        {
          issueId: 77,
          id: 3,
          name: 'Frontend',
          color: '#38bdf8',
          description: 'Browser-facing changes',
          projectId: null
        }
      ] as never)
      .mockResolvedValueOnce([
        {
          issueId: 81,
          id: 4,
          name: 'Backend',
          color: '#f97316',
          description: 'Server-facing changes',
          projectId: null
        }
      ] as never);
    issueWatcherRepository.listByIssueIds
      .mockResolvedValueOnce([{ issueId: 77, userId: 10, displayName: 'Alex Kim' }] as never)
      .mockResolvedValueOnce([{ issueId: 81, userId: 9, displayName: 'Jordan Lee' }] as never);
    issueRepository.countCommentsByIssueIds
      .mockResolvedValueOnce(new Map([[77, 3]]) as never)
      .mockResolvedValueOnce(new Map([[81, 1]]) as never);
    issueRepository.countAttachmentsByIssueIds
      .mockResolvedValueOnce(new Map([[77, 1]]) as never)
      .mockResolvedValueOnce(new Map([[81, 2]]) as never);
    issueRepository.countSubtasksByIssueIds
      .mockResolvedValueOnce(new Map([[77, { total: 4, done: 1 }]]) as never)
      .mockResolvedValueOnce(new Map([[81, { total: 2, done: 2 }]]) as never);

    const result = await service.getIssueById('5', '9', ['tenant_user'], '77');

    expect(result.subtasks[0]).toEqual(
      expect.objectContaining({
        id: 81,
        commentsCount: 1,
        attachmentsCount: 2,
        watchersCount: 1,
        subtaskCount: 2,
        completedSubtaskCount: 2,
        labels: [expect.objectContaining({ name: 'Backend' })],
        assignees: [expect.objectContaining({ userId: 10 })]
      })
    );
  });

  it('returns a summary with open issue count derived from statuses', async () => {
    const result = await service.getIssuesSummary({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user']
    });

    expect(result).toEqual({
      total: 4,
      backlog: 1,
      inProgress: 2,
      blocked: 1,
      done: 0,
      open: 4
    });
  });

  it('creates an issue, validates scope, and records an audit event', async () => {
    const result = await service.createIssue('5', '9', 'actor-9', ['tenant_user'], {
      title: 'Created issue',
      projectId: 12
    });

    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(5, 12, {
      userId: 9,
      roles: ['tenant_user']
    });
    expect(issueRepository.createWithDatabase).toHaveBeenCalled();
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ activityType: 'issue.created' })
    );
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.id).toBe(77);
  });

  it('updates an issue and records the audit payload', async () => {
    const result = await service.updateIssue('5', '9', 'actor-9', ['tenant_user'], '77', {
      baseRevision: '2026-03-22T03:15:00.000Z',
      status: 'done',
      priority: 'medium'
    });

    expect(issueRepository.updateWithDatabase).toHaveBeenCalled();
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ activityType: 'issue.updated' })
    );
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ activityType: 'issue.status_changed' })
    );
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ activityType: 'issue.priority_changed' })
    );
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.id).toBe(77);
  });

  it('accepts estimate zero as a valid story point value', async () => {
    await service.updateIssue('5', '9', 'actor-9', ['tenant_user'], '77', {
      estimate: 0
    });

    expect(issueRepository.updateWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      77,
      expect.objectContaining({
        estimate: 0
      })
    );
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({
        activityType: 'issue.updated',
        metadataJson: expect.objectContaining({
          changedFields: expect.arrayContaining(['estimate'])
        })
      })
    );
  });

  it('clears due date and estimate when null values are provided', async () => {
    issueRepository.findVisibleIssueByIdOrThrow.mockResolvedValue({
      id: 77,
      organizationId: 5,
      projectId: 12,
      parentIssueId: null,
      issueNumber: 142,
      title: 'Restore standalone issue details page',
      descriptionMarkdown: 'Bring the old detail route back.',
      status: 'in_progress',
      priority: 'high',
      position: 1,
      estimate: 5,
      dueAt: new Date('2026-03-29T00:00:00.000Z'),
      resolvedAt: null,
      createdBy: 9,
      updatedBy: 9,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-22T03:15:00.000Z'),
      projectName: 'Atlas',
      projectVisibility: 'private'
    } as never);
    issueRepository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 77,
      organizationId: 5,
      projectId: 12,
      parentIssueId: null,
      issueNumber: 142,
      title: 'Restore standalone issue details page',
      descriptionMarkdown: 'Bring the old detail route back.',
      status: 'in_progress',
      priority: 'high',
      position: 1,
      estimate: 5,
      dueAt: new Date('2026-03-29T00:00:00.000Z'),
      resolvedAt: null,
      createdBy: 9,
      updatedBy: 9,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-22T03:15:00.000Z'),
      projectName: 'Atlas',
      projectVisibility: 'private'
    } as never);

    await service.updateIssue('5', '9', 'actor-9', ['tenant_user'], '77', {
      estimate: null,
      dueAt: null
    } as never);

    expect(issueRepository.updateWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      77,
      expect.objectContaining({
        estimate: null,
        dueAt: null
      })
    );
  });

  it('preserves resolvedAt when editing an issue that is already done', async () => {
    const existingResolvedAt = new Date('2026-03-22T04:00:00.000Z');

    issueRepository.findVisibleIssueByIdOrThrow.mockResolvedValue({
      id: 77,
      organizationId: 5,
      projectId: 12,
      parentIssueId: null,
      issueNumber: 142,
      title: 'Restore standalone issue details page',
      descriptionMarkdown: 'Bring the old detail route back.',
      status: 'done',
      priority: 'high',
      position: 1,
      estimate: 5,
      dueAt: null,
      resolvedAt: existingResolvedAt,
      createdBy: 9,
      updatedBy: 9,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-22T03:15:00.000Z'),
      projectName: 'Atlas',
      projectVisibility: 'private'
    } as never);
    issueRepository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 77,
      organizationId: 5,
      projectId: 12,
      parentIssueId: null,
      issueNumber: 142,
      title: 'Restore standalone issue details page',
      descriptionMarkdown: 'Bring the old detail route back.',
      status: 'done',
      priority: 'high',
      position: 1,
      estimate: 5,
      dueAt: null,
      resolvedAt: existingResolvedAt,
      createdBy: 9,
      updatedBy: 9,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-22T03:15:00.000Z'),
      projectName: 'Atlas',
      projectVisibility: 'private'
    } as never);

    await service.updateIssue('5', '9', 'actor-9', ['tenant_user'], '77', {
      title: 'Updated title'
    });

    expect(issueRepository.updateWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      77,
      expect.objectContaining({
        title: 'Updated title',
        status: 'done',
        resolvedAt: existingResolvedAt
      })
    );
  });

  it('cascades issue deletion across subtasks, dependent records, and linked files', async () => {
    fileRepository.findByIdIncludingDeletedOrThrowWithDatabase
      .mockImplementationOnce(
        async () =>
          ({
            id: 101,
            organizationId: 5,
            uploadedByUserId: 9,
            storageInstance: 'uploads',
            bucket: 'app-uploads',
            objectKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
            originalFilename: 'design-spec.pdf',
            mimeType: 'application/pdf',
            byteSize: 1024,
            checksumSha256: null,
            etag: null,
            status: 'ready',
            visibility: 'private',
            purpose: 'issue_attachment',
            metadata: { source: 'issues-ui', issueId: 77, projectId: 12 },
            uploadedAt: new Date('2026-03-22T04:44:00.000Z'),
            lastAccessedAt: null,
            deletedAt: null,
            purgedAt: null,
            createdAt: new Date('2026-03-22T04:43:00.000Z'),
            updatedAt: new Date('2026-03-22T04:44:00.000Z')
          }) as never
      )
      .mockImplementationOnce(
        async () =>
          ({
            id: 102,
            organizationId: 5,
            uploadedByUserId: 9,
            storageInstance: 'uploads',
            bucket: 'app-uploads',
            objectKey: 'org/5/uploads/issue_attachment/102/subtask-doc.pdf',
            originalFilename: 'subtask-doc.pdf',
            mimeType: 'application/pdf',
            byteSize: 2048,
            checksumSha256: null,
            etag: null,
            status: 'ready',
            visibility: 'private',
            purpose: 'issue_attachment',
            metadata: { source: 'issues-ui', issueId: 88, projectId: 12 },
            uploadedAt: new Date('2026-03-22T04:54:00.000Z'),
            lastAccessedAt: null,
            deletedAt: null,
            purgedAt: null,
            createdAt: new Date('2026-03-22T04:53:00.000Z'),
            updatedAt: new Date('2026-03-22T04:54:00.000Z')
          }) as never
      );
    fileRepository.countActiveReferencesWithDatabase
      .mockImplementationOnce(
        async () =>
          ({
            avatarCount: 0,
            issueAttachmentCount: 0,
            contentAttachmentCount: 0,
            total: 0
          }) as never
      )
      .mockImplementationOnce(
        async () =>
          ({
            avatarCount: 0,
            issueAttachmentCount: 0,
            contentAttachmentCount: 0,
            total: 0
          }) as never
      );

    await service.deleteIssue('5', '9', 'actor-9', ['tenant_admin'], '77');

    expect(issueRepository.listActiveIssueTreeIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      77
    );
    expect(issueCommentRepository.softDeleteByIssueIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      [77, 88, 89],
      expect.any(Date)
    );
    expect(issueAttachmentRepository.softDeleteByIssueIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      [77, 88, 89],
      expect.any(Date)
    );
    expect(issueAssigneeRepository.deleteByIssueIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      [77, 88, 89]
    );
    expect(issueWatcherRepository.deleteByIssueIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      [77, 88, 89]
    );
    expect(issueLabelRepository.deleteAssignmentsByIssueIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      [77, 88, 89]
    );
    expect(issueRelationRepository.deleteByIssueIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      [77, 88, 89]
    );
    expect(issueActivityRepository.deleteByIssueIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      [77, 88, 89]
    );
    expect(issueRepository.softDeleteByIdsWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      [77, 88, 89],
      9,
      expect.any(Date)
    );
    expect(issueRepository.clearParentIssueForChildIssuesWithDatabase).not.toHaveBeenCalled();
    expect(fileRepository.countActiveReferencesWithDatabase).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      5,
      101
    );
    expect(fileRepository.countActiveReferencesWithDatabase).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      5,
      102
    );
    expect(fileRepository.markPendingDeleteWithDatabase).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      5,
      101,
      expect.any(Date)
    );
    expect(fileRepository.markPendingDeleteWithDatabase).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      5,
      102,
      expect.any(Date)
    );
    expect(fileRepository.markPendingDeleteWithDatabase).toHaveBeenCalledTimes(2);
    expect(auditOutbox.insert).toHaveBeenCalled();
  });

  it('creates a comment, writes activity, bumps issue freshness, and records audit metadata', async () => {
    const result = await service.createIssueComment(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      '77',
      {
        bodyMarkdown: 'Looks good.'
      },
      {
        requestId: 'req-comment',
        correlationId: 'corr-comment',
        causationId: 'cause-comment'
      }
    );

    expect(issueCommentRepository.createWithDatabase).toHaveBeenCalled();
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({
        issueId: 77,
        actorUserId: 9,
        activityType: 'issue.comment_added'
      })
    );
    expect(issueRepository.updateWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      77,
      expect.objectContaining({
        updatedBy: 9
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.id).toBe(77);
  });

  it('creates an issue attachment, copies compatibility metadata, and records audit metadata', async () => {
    const result = await service.createIssueAttachment(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      '77',
      {
        fileId: 101
      },
      {
        requestId: 'req-attachment',
        correlationId: 'corr-attachment',
        causationId: 'cause-attachment'
      }
    );

    expect(fileRepository.findByIdOrThrowWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      101
    );
    expect(issueAttachmentRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({
        issueId: 77,
        fileId: 101,
        storageKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
        originalFilename: 'design-spec.pdf'
      })
    );
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({
        issueId: 77,
        actorUserId: 9,
        activityType: 'issue.attachment_added'
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.fileId).toBe(101);
  });

  it('creates an issue attachment upload reservation with issue-aware routing context', async () => {
    const result = await service.createIssueAttachmentUpload(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      '77',
      {
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        transport: 'api_proxy'
      },
      {
        requestId: 'req-upload',
        correlationId: 'corr-upload',
        causationId: 'cause-upload'
      }
    );

    expect(storageFilesService.createUploadReservation).toHaveBeenCalledWith(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      expect.objectContaining({
        purpose: 'issue_attachment',
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        transport: 'api_proxy',
        metadata: expect.objectContaining({
          issueId: 77,
          projectId: 12
        })
      }),
      expect.objectContaining({
        requestId: 'req-upload',
        correlationId: 'corr-upload',
        causationId: 'cause-upload'
      }),
      {
        issueAttachmentContext: {
          issueId: 77,
          projectId: 12
        }
      }
    );
    expect(result.upload.transport).toBe('api_proxy');
  });

  it('soft deletes an issue attachment and moves the linked file into pending_delete when it has no active references', async () => {
    await service.deleteIssueAttachment('5', '9', 'actor-9', ['tenant_user'], '77', '51', {
      requestId: 'req-delete',
      correlationId: 'corr-delete',
      causationId: 'cause-delete'
    });

    expect(issueAttachmentRepository.softDeleteByIdWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      77,
      51,
      expect.any(Date)
    );
    expect(fileRepository.countActiveReferencesWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      101
    );
    expect(fileRepository.markPendingDeleteWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      101,
      expect.any(Date)
    );
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({
        issueId: 77,
        actorUserId: 9,
        activityType: 'issue.attachment_removed'
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalled();
  });

  it('returns active issue attachment content and records access audit metadata', async () => {
    const result = await service.getIssueAttachmentContent(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      '77',
      '51',
      {
        requestId: 'req-download',
        correlationId: 'corr-download',
        causationId: 'cause-download'
      }
    );

    expect(issueAttachmentRepository.findActiveByIdWithDatabase).toHaveBeenCalledWith(
      db,
      5,
      77,
      51
    );
    expect(storageRegistry.get).toHaveBeenCalledWith('uploads');
    expect(fileRepository.touchLastAccessedAtWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      101,
      expect.any(Date)
    );
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.contentType).toBe('application/pdf');
    expect(result.contentLength).toBe(7);
    expect(result.contentDisposition).toContain('design-spec.pdf');
  });

  it('treats deleting an already-soft-deleted issue attachment as idempotent success', async () => {
    issueAttachmentRepository.findActiveByIdWithDatabase.mockResolvedValueOnce(null as never);
    issueAttachmentRepository.findByIdWithDatabase.mockResolvedValueOnce({
      id: 51,
      issueId: 77,
      uploadedByUserId: 9,
      fileId: 101,
      storageKey: 'org/5/uploads/issue_attachment/101/design-spec.pdf',
      originalFilename: 'design-spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      createdAt: new Date('2026-03-22T04:45:00.000Z'),
      deletedAt: new Date('2026-03-23T04:45:00.000Z')
    } as never);

    await expect(
      service.deleteIssueAttachment('5', '9', 'actor-9', ['tenant_user'], '77', '51')
    ).resolves.toBeUndefined();

    expect(issueAttachmentRepository.softDeleteByIdWithDatabase).not.toHaveBeenCalled();
    expect(fileRepository.markPendingDeleteWithDatabase).not.toHaveBeenCalled();
  });

  it('rejects attaching a file that belongs to another issue', async () => {
    issueAttachmentRepository.findActiveByFileIdWithDatabase.mockResolvedValueOnce({
      id: 91,
      issueId: 88
    } as never);

    await expect(
      service.createIssueAttachment('5', '9', 'actor-9', ['tenant_user'], '77', {
        fileId: 101
      })
    ).rejects.toMatchObject({
      code: 'API_006'
    });
  });

  it('rejects attaching a file reserved for a different issue', async () => {
    fileRepository.findByIdOrThrowWithDatabase.mockResolvedValueOnce({
      id: 101,
      organizationId: 5,
      uploadedByUserId: 9,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/5/project/12/issue/88/101/design-spec.pdf',
      originalFilename: 'design-spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: null,
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: { source: 'issues-ui', issueId: 88, projectId: 12 },
      uploadedAt: new Date('2026-03-22T04:44:00.000Z'),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date('2026-03-22T04:43:00.000Z'),
      updatedAt: new Date('2026-03-22T04:44:00.000Z')
    } as never);

    await expect(
      service.createIssueAttachment('5', '9', 'actor-9', ['tenant_user'], '77', {
        fileId: 101
      })
    ).rejects.toMatchObject({
      code: 'API_006'
    });
  });

  it('creates, updates, and deletes labels with audit events', async () => {
    const created = await service.createIssueLabel('5', '9', 'actor-9', ['tenant_user'], {
      name: 'Frontend',
      color: '#38bdf8',
      description: 'Browser-facing changes'
    });
    const updated = await service.updateIssueLabel('5', '9', 'actor-9', ['tenant_user'], '3', {
      name: 'Platform'
    });
    await service.deleteIssueLabel('5', '9', 'actor-9', ['tenant_user'], '3');

    expect(issueLabelRepository.createWithDatabase).toHaveBeenCalled();
    expect(issueLabelRepository.updateWithDatabase).toHaveBeenCalled();
    expect(issueLabelRepository.softDeleteWithDatabase).toHaveBeenCalled();
    expect(created.name).toBe('Frontend');
    expect(updated.name).toBe('Platform');
  });

  it('adds and removes assignees with activity and audit events', async () => {
    const added = await service.addIssueAssignee('5', '9', 'actor-9', ['tenant_user'], '77', {
      userId: 10
    });
    await service.removeIssueAssignee(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      ['tenant:issues:update'],
      '77',
      '10'
    );

    expect(projectMemberRepository.isProjectMember).toHaveBeenCalledWith(5, 12, 10);
    expect(issueAssigneeRepository.createWithDatabase).toHaveBeenCalled();
    expect(issueAssigneeRepository.deleteWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      77,
      10
    );
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ activityType: 'issue.assigned' })
    );
    expect(added.id).toBe(77);
  });

  it('allows assigning an active organization member to an org-wide issue', async () => {
    issueRepository.findVisibleIssueByIdOrThrow.mockResolvedValueOnce(
      buildVisibleIssue({
        projectId: null,
        projectVisibility: null
      }) as never
    );

    const added = await service.addIssueAssignee('5', '9', 'actor-9', ['tenant_user'], '77', {
      userId: 10
    });

    expect(projectMemberRepository.assertAssignableOrganizationMember).toHaveBeenCalledWith(5, 10);
    expect(projectMemberRepository.isProjectMember).not.toHaveBeenCalled();
    expect(issueAssigneeRepository.createWithDatabase).toHaveBeenCalled();
    expect(added.id).toBe(77);
  });

  it('allows assigning any active organization member to a public project issue', async () => {
    issueRepository.findVisibleIssueByIdOrThrow.mockResolvedValueOnce(
      buildVisibleIssue({
        projectVisibility: 'public'
      }) as never
    );

    const added = await service.addIssueAssignee('5', '9', 'actor-9', ['tenant_user'], '77', {
      userId: 10
    });

    expect(projectMemberRepository.assertAssignableOrganizationMember).toHaveBeenCalledWith(5, 10);
    expect(projectMemberRepository.isProjectMember).not.toHaveBeenCalled();
    expect(issueAssigneeRepository.createWithDatabase).toHaveBeenCalled();
    expect(added.id).toBe(77);
  });

  it('rejects assigning a non-project member to a private project issue', async () => {
    projectMemberRepository.isProjectMember = jest.fn(async () => false);
    issueRepository.findVisibleIssueByIdOrThrow.mockResolvedValueOnce(
      buildVisibleIssue({
        projectVisibility: 'private'
      }) as never
    );

    await expect(
      service.addIssueAssignee('5', '9', 'actor-9', ['tenant_user'], '77', { userId: 10 })
    ).rejects.toMatchObject({
      code: 'API_006'
    });

    expect(projectMemberRepository.isProjectMember).toHaveBeenCalledWith(5, 12, 10);
    expect(projectMemberRepository.assertAssignableOrganizationMember).not.toHaveBeenCalled();
    expect(issueAssigneeRepository.createWithDatabase).not.toHaveBeenCalled();
    expect(issueActivityRepository.createWithDatabase).not.toHaveBeenCalled();
  });

  it('adds and removes watchers with activity and audit events', async () => {
    const added = await service.addIssueWatcher('5', '9', 'actor-9', ['tenant_user'], '77', {
      userId: 10
    });
    await service.removeIssueWatcher('5', '9', 'actor-9', ['tenant_user'], '77', '10');

    expect(projectMemberRepository.isProjectMember).toHaveBeenCalledWith(5, 12, 10);
    expect(issueWatcherRepository.createWithDatabase).toHaveBeenCalled();
    expect(issueWatcherRepository.deleteWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      77,
      10
    );
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ activityType: 'issue.watcher_added' })
    );
    expect(added.id).toBe(77);
  });

  it('allows a user without issues update permission to remove themselves as an assignee', async () => {
    await expect(
      service.removeIssueAssignee(
        '5',
        '10',
        'actor-10',
        ['tenant_user'],
        ['tenant:issues:read'],
        '77',
        '10'
      )
    ).resolves.toMatchObject({
      id: 77
    });

    expect(issueAssigneeRepository.deleteWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      77,
      10
    );
  });

  it('rejects removing another assignee without issues update permission', async () => {
    await expect(
      service.removeIssueAssignee(
        '5',
        '9',
        'actor-9',
        ['tenant_user'],
        ['tenant:issues:read'],
        '77',
        '10'
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(issueAssigneeRepository.deleteWithDatabase).not.toHaveBeenCalled();
    expect(issueActivityRepository.createWithDatabase).not.toHaveBeenCalled();
  });

  it('keeps watcher eligibility project-scoped even for public projects', async () => {
    issueRepository.findVisibleIssueByIdOrThrow.mockResolvedValueOnce(
      buildVisibleIssue({
        projectVisibility: 'public'
      }) as never
    );

    const added = await service.addIssueWatcher('5', '9', 'actor-9', ['tenant_user'], '77', {
      userId: 10
    });

    expect(projectMemberRepository.isProjectMember).toHaveBeenCalledWith(5, 12, 10);
    expect(projectMemberRepository.assertAssignableOrganizationMember).not.toHaveBeenCalled();
    expect(issueWatcherRepository.createWithDatabase).toHaveBeenCalled();
    expect(added.id).toBe(77);
  });

  it('adds and removes labels with activity and audit events', async () => {
    const added = await service.addIssueLabel('5', '9', 'actor-9', ['tenant_user'], '77', {
      labelId: 3
    });
    await service.removeIssueLabel('5', '9', 'actor-9', ['tenant_user'], '77', '3');

    expect(issueLabelRepository.createAssignmentWithDatabase).toHaveBeenCalled();
    expect(issueLabelRepository.deleteAssignmentWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      77,
      3
    );
    expect(issueActivityRepository.createWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ activityType: 'issue.label_added' })
    );
    expect(added.id).toBe(77);
  });

  it('fails removeIssueLabel when the issue does not have that label assigned', async () => {
    issueLabelRepository.deleteAssignmentWithDatabase = jest.fn(async () => {
      throw new Error('IssueLabelAssignment not found');
    });

    await expect(
      service.removeIssueLabel('5', '9', 'actor-9', ['tenant_user'], '77', '3')
    ).rejects.toThrow('IssueLabelAssignment not found');

    expect(issueActivityRepository.createWithDatabase).not.toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.objectContaining({ activityType: 'issue.label_removed' })
    );
  });
});
