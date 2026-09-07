import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Errors } from '@package/errors';

import {
  ContentQueryScope,
  CreateContentCommentDto,
  CreateContentEntryDto,
  UpdateContentEntryDto
} from '../../dto';
import { ContentService } from '../content.service';

import { ApiException } from '@/common/errors/api-exception';

type ProjectRepositoryDouble = {
  findVisibleByIdOrThrow: jest.MockedFunction<
    (
      tenantId: number,
      projectId: number,
      actor: { userId: number; roles?: readonly string[] }
    ) => Promise<unknown>
  >;
};

type ContentAttachmentRepositoryDouble = {
  listByContentEntryId: jest.MockedFunction<
    (tenantId: number, contentEntryId: number) => Promise<unknown[]>
  >;
  findActiveByEntryAndFileWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      contentEntryId: number,
      fileId: number
    ) => Promise<unknown>
  >;
  createWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      data: {
        contentEntryId: number;
        fileId: number;
        attachedByUserId: number;
        createdAt: Date;
        deletedAt: null;
      }
    ) => Promise<unknown>
  >;
};

type ContentCommentRepositoryDouble = {
  listByContentEntryId: jest.MockedFunction<
    (tenantId: number, contentEntryId: number) => Promise<unknown[]>
  >;
  findVisibleByIdOrThrow: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      contentEntryId: number,
      commentId: number,
      lockForUpdate?: boolean
    ) => Promise<unknown>
  >;
  createWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      data: {
        contentEntryId: number;
        authorUserId: number;
        bodyMarkdown: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: null;
      }
    ) => Promise<unknown>
  >;
  softDeleteWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      contentEntryId: number,
      commentId: number,
      deletedAt: Date
    ) => Promise<void>
  >;
};

type FileRepositoryDouble = {
  findByIdOrThrowWithDatabase: jest.MockedFunction<
    (database: unknown, tenantId: number, fileId: number) => Promise<unknown>
  >;
};

type RepositoryDouble = {
  listByScope: jest.MockedFunction<
    (
      tenantId: number,
      filters: { projectId?: number | null; parentId?: number | null }
    ) => Promise<unknown[]>
  >;
  listSidebarEntriesByScope: jest.MockedFunction<
    (
      tenantId: number,
      filters: { projectId?: number | null; parentId?: number | null }
    ) => Promise<unknown[]>
  >;
  findEntryDetailByIdOrThrow: jest.MockedFunction<
    (tenantId: number, entryId: number) => Promise<unknown>
  >;
  findEntryDetailByIdOrThrowWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      entryId: number,
      lockForUpdate?: boolean
    ) => Promise<unknown>
  >;
  findByIdOrThrow: jest.MockedFunction<(tenantId: number, entryId: number) => Promise<unknown>>;
  findByIdOrThrowWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      entryId: number,
      lockForUpdate?: boolean
    ) => Promise<unknown>
  >;
  findEntryDetailBySlug: jest.MockedFunction<
    (tenantId: number, slug: string, projectId: number | null) => Promise<unknown>
  >;
  findBySlug: jest.MockedFunction<
    (tenantId: number, slug: string, projectId: number | null) => Promise<unknown>
  >;
  ensureProjectBelongsToOrganization: jest.MockedFunction<
    (tenantId: number, projectId: number) => Promise<void>
  >;
  ensureParentInSameScope: jest.MockedFunction<
    (
      tenantId: number,
      parentId: number,
      projectId: number | null,
      database?: unknown,
      lockForUpdate?: boolean
    ) => Promise<unknown>
  >;
  ensureSlugAvailable: jest.MockedFunction<
    (tenantId: number, slug: string, projectId: number | null, excludeId?: number) => Promise<void>
  >;
  createWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      data: {
        projectId: number | null;
        parentId: number | null;
        title: string;
        slug: string;
        contentMarkdown: string;
        position: number;
        createdBy: number;
        updatedBy: number;
      }
    ) => Promise<unknown>
  >;
  updateWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      entryId: number,
      data: Record<string, unknown>
    ) => Promise<unknown>
  >;
  ensureNoCycleOnReparent: jest.MockedFunction<
    (
      tenantId: number,
      entryId: number,
      parentId: number | null,
      database?: unknown
    ) => Promise<void>
  >;
  listActiveSiblingsWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      projectId: number | null,
      parentId: number | null,
      lockForUpdate?: boolean
    ) => Promise<unknown[]>
  >;
  updateSiblingPositionsWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      siblingIdsInOrder: number[],
      updatedBy: number,
      updatedAt: Date
    ) => Promise<void>
  >;
  collectActiveSubtreeIdsWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      rootEntry: { id: number; projectId: number | null },
      lockForUpdate?: boolean
    ) => Promise<number[]>
  >;
  softDeleteManyWithDatabase: jest.MockedFunction<
    (
      database: unknown,
      tenantId: number,
      entryIds: number[],
      updatedBy: number
    ) => Promise<number[]>
  >;
  softDeleteWithDatabase: jest.MockedFunction<
    (database: unknown, tenantId: number, entryId: number, updatedBy: number) => Promise<void>
  >;
};

type TransactionDatabaseDouble = {
  transaction: jest.MockedFunction<
    (callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>
  >;
};

type AuditOutboxDouble = {
  insert: jest.MockedFunction<(target: unknown, params: Record<string, unknown>) => Promise<void>>;
};

type AvatarUrlResolverDouble = {
  resolvePhotoUrl: jest.MockedFunction<
    (
      tenantId: string,
      user: { id: number; avatarFileId: number | null; photoUrl: string | null }
    ) => Promise<string | null>
  >;
  resolvePhotoUrls: jest.MockedFunction<
    (
      tenantId: string,
      users: readonly { id: number; avatarFileId: number | null; photoUrl: string | null }[]
    ) => Promise<ReadonlyMap<number, string | null>>
  >;
};

describe('ContentService', () => {
  let service: ContentService;
  let contentAttachmentRepository: ContentAttachmentRepositoryDouble;
  let contentCommentRepository: ContentCommentRepositoryDouble;
  let repository: RepositoryDouble;
  let projectRepository: ProjectRepositoryDouble;
  let fileRepository: FileRepositoryDouble;
  let db: TransactionDatabaseDouble;
  let auditOutbox: AuditOutboxDouble;
  let avatarUrlResolver: AvatarUrlResolverDouble;

  beforeEach(() => {
    contentAttachmentRepository = {
      listByContentEntryId: jest.fn(async () => [
        {
          id: 91,
          contentEntryId: 11,
          fileId: 101,
          attachedByUserId: 44,
          attachedByDisplayName: 'Jordan Lee',
          uploadedByUserId: 44,
          originalFilename: 'content-brief.pdf',
          mimeType: 'application/pdf',
          byteSize: 2048,
          status: 'ready',
          visibility: 'private',
          storageInstance: 'uploads',
          bucket: 'app-uploads',
          objectKey: 'org/12/uploads/content_upload/101/content-brief.pdf',
          createdAt: new Date('2026-03-21T02:00:00.000Z')
        }
      ]),
      findActiveByEntryAndFileWithDatabase: jest.fn(async () => null),
      createWithDatabase: jest.fn(async (_database, tenantId, data) => ({
        id: 91,
        organizationId: tenantId,
        contentEntryId: data.contentEntryId,
        fileId: data.fileId,
        attachedByUserId: data.attachedByUserId,
        createdAt: data.createdAt,
        deletedAt: null
      }))
    };
    contentCommentRepository = {
      listByContentEntryId: jest.fn(async () => [
        {
          id: 92,
          contentEntryId: 11,
          authorUserId: 44,
          authorDisplayName: 'Jordan Lee',
          authorAvatarFileId: null,
          authorPhotoUrl: 'https://cdn.example.test/jordan.png',
          bodyMarkdown: 'Newest comment',
          createdAt: new Date('2026-03-28T12:00:00.000Z'),
          updatedAt: new Date('2026-03-28T12:00:00.000Z')
        },
        {
          id: 91,
          contentEntryId: 11,
          authorUserId: 45,
          authorDisplayName: 'Alex Carter',
          authorAvatarFileId: null,
          authorPhotoUrl: null,
          bodyMarkdown: 'Older comment',
          createdAt: new Date('2026-03-28T11:00:00.000Z'),
          updatedAt: new Date('2026-03-28T11:00:00.000Z')
        }
      ]),
      findVisibleByIdOrThrow: jest.fn(async (_database, _tenantId, contentEntryId, commentId) => ({
        id: commentId,
        contentEntryId,
        authorUserId: 44,
        authorDisplayName: 'Jordan Lee',
        authorAvatarFileId: null,
        authorPhotoUrl: 'https://cdn.example.test/jordan.png',
        bodyMarkdown: 'Newest comment',
        createdAt: new Date('2026-03-28T12:00:00.000Z'),
        updatedAt: new Date('2026-03-28T12:00:00.000Z')
      })),
      createWithDatabase: jest.fn(async (_database, tenantId, data) => ({
        id: 93,
        organizationId: tenantId,
        contentEntryId: data.contentEntryId,
        authorUserId: data.authorUserId,
        bodyMarkdown: data.bodyMarkdown,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        deletedAt: null
      })),
      softDeleteWithDatabase: jest.fn(async () => undefined)
    };
    repository = {
      listByScope: jest.fn(async () => []),
      listSidebarEntriesByScope: jest.fn(async () => []),
      findEntryDetailByIdOrThrow: jest.fn(async () => ({})),
      findEntryDetailByIdOrThrowWithDatabase: jest.fn(async (_database, tenantId, entryId) => ({
        id: entryId,
        organizationId: tenantId,
        projectId: null,
        parentId: null,
        title: 'Home',
        slug: 'home',
        contentMarkdown: '# Home',
        position: 0,
        createdBy: 44,
        updatedBy: 44,
        updatedByDisplayName: 'Jordan Lee',
        updatedByAvatarFileId: null,
        updatedByPhotoUrl: 'https://cdn.example.test/jordan.png',
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-21T01:00:00.000Z')
      })),
      findByIdOrThrow: jest.fn(async () => ({})),
      findByIdOrThrowWithDatabase: jest.fn(async (_database, tenantId, entryId) => ({
        id: entryId,
        organizationId: tenantId,
        projectId: null,
        parentId: null,
        title: 'Home',
        slug: 'home',
        contentMarkdown: '# Home',
        position: 0,
        createdBy: 44,
        updatedBy: 44,
        updatedByDisplayName: 'Jordan Lee',
        updatedByAvatarFileId: null,
        updatedByPhotoUrl: 'https://cdn.example.test/jordan.png',
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-21T01:00:00.000Z')
      })),
      findEntryDetailBySlug: jest.fn(async () => null),
      findBySlug: jest.fn(async () => null),
      ensureProjectBelongsToOrganization: jest.fn(async () => undefined),
      ensureParentInSameScope: jest.fn(async () => ({})),
      ensureSlugAvailable: jest.fn(async () => undefined),
      createWithDatabase: jest.fn(async (_database, tenantId, data) => ({
        id: 101,
        organizationId: tenantId,
        projectId: data.projectId,
        parentId: data.parentId,
        title: data.title,
        slug: data.slug,
        contentMarkdown: data.contentMarkdown,
        position: data.position,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
        updatedByDisplayName: 'Jordan Lee',
        updatedByAvatarFileId: null,
        updatedByPhotoUrl: 'https://cdn.example.test/jordan.png',
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-21T01:00:00.000Z')
      })),
      updateWithDatabase: jest.fn(async (_database, tenantId, entryId, data) => ({
        id: entryId,
        organizationId: tenantId,
        projectId: null,
        parentId: (data['parentId'] as number | null | undefined) ?? null,
        title: (data['title'] as string | undefined) ?? 'Home',
        slug: (data['slug'] as string | undefined) ?? 'home',
        contentMarkdown: (data['contentMarkdown'] as string | undefined) ?? '# Home',
        position: (data['position'] as number | undefined) ?? 0,
        createdBy: 44,
        updatedBy: (data['updatedBy'] as number | undefined) ?? 44,
        updatedByDisplayName: 'Jordan Lee',
        updatedByAvatarFileId: null,
        updatedByPhotoUrl: 'https://cdn.example.test/jordan.png',
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: (data['updatedAt'] as Date | undefined) ?? new Date('2026-03-21T01:00:00.000Z')
      })),
      ensureNoCycleOnReparent: jest.fn(async () => undefined),
      listActiveSiblingsWithDatabase: jest.fn(async () => []),
      updateSiblingPositionsWithDatabase: jest.fn(async () => undefined),
      collectActiveSubtreeIdsWithDatabase: jest.fn(async () => [11]),
      softDeleteManyWithDatabase: jest.fn(async (_database, _tenantId, entryIds) => entryIds),
      softDeleteWithDatabase: jest.fn(async () => undefined)
    };
    projectRepository = {
      findVisibleByIdOrThrow: jest.fn(async () => ({}))
    };
    fileRepository = {
      findByIdOrThrowWithDatabase: jest.fn(async (_database, tenantId, fileId) => ({
        id: fileId,
        organizationId: tenantId,
        uploadedByUserId: 44,
        storageInstance: 'uploads',
        bucket: 'app-uploads',
        objectKey: 'org/12/uploads/content_upload/101/content-brief.pdf',
        originalFilename: 'content-brief.pdf',
        mimeType: 'application/pdf',
        byteSize: 2048,
        checksumSha256: null,
        etag: null,
        status: 'ready',
        visibility: 'private',
        purpose: 'content_upload',
        metadata: {},
        uploadedAt: new Date('2026-03-21T01:30:00.000Z'),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date('2026-03-21T01:00:00.000Z'),
        updatedAt: new Date('2026-03-21T01:30:00.000Z')
      }))
    };
    db = {
      transaction: jest.fn(async (callback) => callback({ tx: 'content' }))
    };
    auditOutbox = {
      insert: jest.fn(async () => undefined)
    };
    avatarUrlResolver = {
      resolvePhotoUrl: jest.fn(async (_tenantId, user) => user.photoUrl),
      resolvePhotoUrls: jest.fn(
        async (_tenantId, users) =>
          new Map(users.map((user) => [user.id, user.photoUrl ?? null] as const))
      )
    };

    service = new ContentService(
      contentAttachmentRepository as never,
      contentCommentRepository as never,
      repository as never,
      projectRepository as never,
      fileRepository as never,
      auditOutbox as never,
      avatarUrlResolver as never,
      db as never
    );
  });

  it('lists entries within a requested scope', async () => {
    repository.listByScope.mockResolvedValue([
      {
        id: 11,
        organizationId: 12,
        projectId: null,
        parentId: null,
        title: 'Home',
        slug: 'home',
        contentMarkdown: '# Home',
        position: 0,
        createdBy: 44,
        updatedBy: 44,
        updatedByDisplayName: 'Jordan Lee',
        updatedByAvatarFileId: null,
        updatedByPhotoUrl: 'https://cdn.example.test/jordan.png',
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-21T01:00:00.000Z'),
        deletedAt: null
      }
    ]);

    const result = await service.listEntries({
      tenantId: '12',
      userId: '44',
      projectId: undefined,
      parentId: undefined
    });

    expect(repository.listByScope).toHaveBeenCalledWith(12, {
      projectId: undefined,
      parentId: undefined
    });
    expect(projectRepository.findVisibleByIdOrThrow).not.toHaveBeenCalled();
    expect(result[0]?.slug).toBe('home');
    expect(result[0]?.updatedByDisplayName).toBe('Jordan Lee');
    expect(result[0]?.updatedByPhotoUrl).toBe('https://cdn.example.test/jordan.png');
  });

  it('loads a single entry by id', async () => {
    repository.findEntryDetailByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      updatedByDisplayName: 'Jordan Lee',
      updatedByAvatarFileId: null,
      updatedByPhotoUrl: 'https://cdn.example.test/jordan.png',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z'),
      deletedAt: null
    });

    const result = await service.getEntryById('12', '44', ['tenant_user'], '11');

    expect(repository.findEntryDetailByIdOrThrow).toHaveBeenCalledWith(12, 11);
    expect(result.id).toBe(11);
  });

  it('resolves signed updater avatar URLs when an avatar file is present', async () => {
    repository.listByScope.mockResolvedValue([
      {
        id: 11,
        organizationId: 12,
        projectId: null,
        parentId: null,
        title: 'Home',
        slug: 'home',
        contentMarkdown: '# Home',
        position: 0,
        createdBy: 44,
        updatedBy: 44,
        updatedByDisplayName: 'Jordan Lee',
        updatedByAvatarFileId: 301,
        updatedByPhotoUrl: null,
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-21T01:00:00.000Z'),
        deletedAt: null
      }
    ]);
    avatarUrlResolver.resolvePhotoUrl.mockResolvedValue('https://signed.example.test/avatar-301');

    const result = await service.listEntries({
      tenantId: '12',
      userId: '44',
      projectId: undefined,
      parentId: undefined
    });

    expect(avatarUrlResolver.resolvePhotoUrl).toHaveBeenCalledWith('12', {
      id: 44,
      avatarFileId: 301,
      photoUrl: null
    });
    expect(result[0]?.updatedByPhotoUrl).toBe('https://signed.example.test/avatar-301');
  });

  it('resolves signed updater avatar URLs for sidebar entries', async () => {
    repository.listSidebarEntriesByScope.mockResolvedValue([
      {
        id: 11,
        organizationId: 12,
        projectId: null,
        parentId: null,
        title: 'Home',
        slug: 'home',
        position: 0,
        updatedBy: 44,
        updatedByDisplayName: 'Jordan Lee',
        updatedByAvatarFileId: 301,
        updatedByPhotoUrl: null,
        updatedAt: new Date('2026-03-21T01:00:00.000Z'),
        deletedAt: null
      }
    ]);
    avatarUrlResolver.resolvePhotoUrls.mockResolvedValue(
      new Map([[44, 'https://signed.example.test/avatar-301']])
    );

    const result = await service.listSidebarEntries({
      tenantId: '12',
      userId: '44',
      projectId: undefined,
      parentId: undefined
    });

    expect(avatarUrlResolver.resolvePhotoUrls).toHaveBeenCalledWith('12', [
      {
        id: 44,
        avatarFileId: 301,
        photoUrl: null
      }
    ]);
    expect(result[0]).toMatchObject({
      id: 11,
      updatedByPhotoUrl: 'https://signed.example.test/avatar-301'
    });
  });

  it('lists attachments for an authorized content entry', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z'),
      deletedAt: null
    });

    const result = await service.listAttachments('12', '44', ['tenant_user'], '11');

    expect(contentAttachmentRepository.listByContentEntryId).toHaveBeenCalledWith(12, 11);
    expect(result[0]).toEqual(
      expect.objectContaining({
        fileId: 101,
        originalFilename: 'content-brief.pdf'
      })
    );
  });

  it('verifies project visibility before listing project-scoped entries', async () => {
    await service.listEntries({
      tenantId: '12',
      userId: '44',
      roles: ['tenant_user'],
      scope: ContentQueryScope.PROJECT,
      projectId: '77'
    });

    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(12, 77, {
      userId: 44,
      roles: ['tenant_user']
    });
  });

  it('forces organization scope to query only organization content', async () => {
    repository.listByScope.mockResolvedValue([]);

    await service.listEntries({
      tenantId: '12',
      userId: '44',
      roles: ['tenant_user'],
      scope: ContentQueryScope.ORGANIZATION
    });

    expect(projectRepository.findVisibleByIdOrThrow).not.toHaveBeenCalled();
    expect(repository.listByScope).toHaveBeenCalledWith(12, {
      projectId: null,
      parentId: undefined
    });
  });

  it('derives project visibility from the parent entry when parentId is provided without projectId', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 91,
      organizationId: 12,
      projectId: 77,
      parentId: null,
      title: 'Project Root',
      slug: 'project-root',
      contentMarkdown: '# Project Root',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z'),
      deletedAt: null
    });

    await service.listEntries({
      tenantId: '12',
      userId: '44',
      roles: ['tenant_user'],
      parentId: '91'
    });

    expect(repository.findByIdOrThrow).toHaveBeenCalledWith(12, 91);
    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(12, 77, {
      userId: 44,
      roles: ['tenant_user']
    });
    expect(repository.listByScope).toHaveBeenCalledWith(12, {
      projectId: 77,
      parentId: 91
    });
  });

  it('rejects organization scope when the parent belongs to a project', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 91,
      organizationId: 12,
      projectId: 77,
      parentId: null,
      title: 'Project Root',
      slug: 'project-root',
      contentMarkdown: '# Project Root',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z'),
      deletedAt: null
    });
    repository.ensureParentInSameScope.mockRejectedValue(
      Errors.validationvalidationFailedField001({ field: 'parentId' })
    );

    await expect(
      service.listEntries({
        tenantId: '12',
        userId: '44',
        roles: ['tenant_user'],
        scope: ContentQueryScope.ORGANIZATION,
        parentId: '91'
      })
    ).rejects.toThrow(Errors.validationvalidationFailedField001({ field: 'parentId' }));
  });

  it('verifies project visibility for project-scoped entries loaded by id', async () => {
    repository.findEntryDetailByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: 77,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      updatedByDisplayName: 'Jordan Lee',
      updatedByAvatarFileId: null,
      updatedByPhotoUrl: 'https://cdn.example.test/jordan.png',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });

    await service.getEntryById('12', '44', ['tenant_user'], '11');

    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(12, 77, {
      userId: 44,
      roles: ['tenant_user']
    });
  });

  it('throws when a slug lookup misses within scope', async () => {
    repository.findEntryDetailBySlug.mockResolvedValue(null);

    await expect(
      service.getEntryBySlug({
        tenantId: '12',
        userId: '44',
        roles: ['tenant_user'],
        slug: 'missing',
        scope: ContentQueryScope.PROJECT,
        projectId: '44'
      })
    ).rejects.toThrow(Errors.databaserecordNotFound004({ entity: 'ContentEntry' }));
  });

  it('rejects project-scoped slug lookups without a project id', async () => {
    await expect(
      service.getEntryBySlug({
        tenantId: '12',
        userId: '44',
        roles: ['tenant_user'],
        slug: 'missing',
        scope: ContentQueryScope.PROJECT
      })
    ).rejects.toThrow('project scope requires a visible project context');
  });

  it('creates an org-scoped entry and generates a normalized slug', async () => {
    const dto = new CreateContentEntryDto();
    dto.title = 'Getting Started';
    dto.contentMarkdown = '# Getting Started';
    repository.findEntryDetailByIdOrThrowWithDatabase.mockResolvedValueOnce({
      id: 101,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Getting Started',
      slug: 'getting-started',
      contentMarkdown: '# Getting Started',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      updatedByDisplayName: 'Jordan Lee',
      updatedByAvatarFileId: null,
      updatedByPhotoUrl: 'https://cdn.example.test/jordan.png',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });

    const result = await service.createEntry('12', '44', 'actor-44', ['tenant_admin'], dto, {
      requestId: 'req-1',
      correlationId: 'corr-1',
      causationId: 'cause-1'
    });

    expect(db.transaction).toHaveBeenCalled();
    expect(repository.ensureSlugAvailable).toHaveBeenCalledWith(12, 'getting-started', null);
    expect(repository.createWithDatabase).toHaveBeenCalledWith({ tx: 'content' }, 12, {
      projectId: null,
      parentId: null,
      title: 'Getting Started',
      slug: 'getting-started',
      contentMarkdown: '# Getting Started',
      position: 0,
      createdBy: 44,
      updatedBy: 44
    });
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.slug).toBe('getting-started');
  });

  it('creates a content attachment and writes an audit event', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z'),
      deletedAt: null
    });

    const result = await service.createAttachment(
      '12',
      '44',
      'actor-44',
      ['tenant_user'],
      '11',
      { fileId: 101 },
      {
        requestId: 'req-content-attachment',
        correlationId: 'corr-content-attachment',
        causationId: 'cause-content-attachment'
      }
    );

    expect(fileRepository.findByIdOrThrowWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      101
    );
    expect(contentAttachmentRepository.createWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      expect.objectContaining({
        contentEntryId: 11,
        fileId: 101,
        attachedByUserId: 44
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.fileId).toBe(101);
  });

  it('validates project scope and parent scope before creating a project entry', async () => {
    const dto = new CreateContentEntryDto();
    dto.title = 'Project Setup';
    dto.contentMarkdown = '# Setup';
    dto.projectId = 77;
    dto.parentId = 88;

    await service.createEntry('12', '44', 'actor-44', ['tenant_user'], dto);

    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(12, 77, {
      userId: 44,
      roles: ['tenant_user']
    });
    expect(repository.ensureProjectBelongsToOrganization).toHaveBeenCalledWith(12, 77);
    expect(repository.ensureParentInSameScope).toHaveBeenCalledWith(
      12,
      88,
      77,
      { tx: 'content' },
      true
    );
  });

  it('keeps the existing slug stable when updating without an explicit slug', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });

    const dto = new UpdateContentEntryDto();
    dto.title = 'Homepage';

    const result = await service.updateEntry('12', '44', 'actor-44', ['tenant_admin'], '11', dto);

    expect(repository.ensureSlugAvailable).not.toHaveBeenCalled();
    expect(repository.updateWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      11,
      expect.objectContaining({
        title: 'Homepage',
        slug: 'home',
        updatedBy: 44
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.slug).toBe('home');
  });

  it('rejects updates with a stale base revision', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });

    const dto = new UpdateContentEntryDto();
    dto.title = 'Homepage';
    Object.assign(dto, { baseRevision: '2026-03-21T00:55:00.000Z' });

    await expect(
      service.updateEntry('12', '44', 'actor-44', ['tenant_admin'], '11', dto)
    ).rejects.toThrow(ApiException.concurrentModificationConflict('content', '11'));
    expect(repository.updateWithDatabase).not.toHaveBeenCalled();
  });

  it('validates cycle checks before reparenting an entry', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: 77,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: 77,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.listActiveSiblingsWithDatabase.mockResolvedValue([]);

    const dto = new UpdateContentEntryDto();
    dto.parentId = 99;

    await service.updateEntry('12', '44', 'actor-44', ['tenant_user'], '11', dto);

    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(12, 77, {
      userId: 44,
      roles: ['tenant_user']
    });
    expect(repository.ensureNoCycleOnReparent).toHaveBeenCalledWith(12, 11, 99, {
      tx: 'content'
    });
  });

  it('reorders sibling positions when moving within the same parent', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Beta',
      slug: 'beta',
      contentMarkdown: '# Beta',
      position: 1,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Beta',
      slug: 'beta',
      contentMarkdown: '# Beta',
      position: 1,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.listActiveSiblingsWithDatabase
      .mockResolvedValueOnce([
        { id: 10, position: 0 },
        { id: 11, position: 1 },
        { id: 12, position: 2 }
      ])
      .mockResolvedValueOnce([
        { id: 10, position: 0 },
        { id: 11, position: 1 },
        { id: 12, position: 2 }
      ]);

    const dto = new UpdateContentEntryDto();
    dto.position = 0;

    await service.updateEntry('12', '44', 'actor-44', ['tenant_admin'], '11', dto);

    expect(repository.updateSiblingPositionsWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      [11, 10, 12],
      44,
      expect.any(Date)
    );
    expect(repository.updateWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      11,
      expect.objectContaining({
        parentId: null,
        position: 0,
        updatedBy: 44
      })
    );
  });

  it('moves an entry into the destination parent before reordering destination siblings', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: 20,
      title: 'Child',
      slug: 'child',
      contentMarkdown: '# Child',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: 20,
      title: 'Child',
      slug: 'child',
      contentMarkdown: '# Child',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.listActiveSiblingsWithDatabase
      .mockResolvedValueOnce([{ id: 30, position: 0 }])
      .mockResolvedValueOnce([
        { id: 11, position: 0 },
        { id: 12, position: 1 }
      ])
      .mockResolvedValueOnce([{ id: 30, position: 0 }]);

    const dto = new UpdateContentEntryDto();
    dto.parentId = 21;
    dto.position = 0;

    await service.updateEntry('12', '44', 'actor-44', ['tenant_admin'], '11', dto);

    const destinationReorderCallOrder =
      repository.updateSiblingPositionsWithDatabase.mock.invocationCallOrder[1];
    const premoveCallOrder = repository.updateWithDatabase.mock.calls.find(
      ([, tenantId, entryId, data]) => {
        const payload = data as Record<string, unknown>;

        return (
          tenantId === 12 &&
          entryId === 11 &&
          payload['parentId'] === 21 &&
          typeof payload['position'] === 'number' &&
          Number(payload['position']) >= 1000
        );
      }
    );

    expect(destinationReorderCallOrder).toBeDefined();
    expect(premoveCallOrder).toBeDefined();
    expect(
      repository.updateWithDatabase.mock.invocationCallOrder[
        repository.updateWithDatabase.mock.calls.indexOf(premoveCallOrder as never)
      ]
    ).toBeLessThan(destinationReorderCallOrder as number);
  });

  it('deletes an entry subtree and records the deleted count in audit details', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    repository.collectActiveSubtreeIdsWithDatabase.mockResolvedValue([11, 12, 13]);
    repository.softDeleteManyWithDatabase.mockResolvedValue([11, 12, 13]);

    await service.deleteEntry('12', '44', 'actor-44', ['tenant_admin'], '11');

    expect(db.transaction).toHaveBeenCalled();
    expect(repository.collectActiveSubtreeIdsWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      expect.objectContaining({ id: 11, projectId: null }),
      true
    );
    expect(repository.softDeleteManyWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      [11, 12, 13],
      44
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      { tx: 'content' },
      expect.objectContaining({
        payload: expect.objectContaining({
          details: expect.objectContaining({
            contentEntryId: '11',
            deletedCount: '3'
          })
        })
      })
    );
  });

  it('lists comments in descending order with resolved avatars and delete capability', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null
    });
    avatarUrlResolver.resolvePhotoUrls.mockResolvedValue(
      new Map([
        [44, 'https://signed.example.test/jordan.png'],
        [45, null]
      ])
    );

    const result = await service.listComments('12', '44', ['tenant_user'], '11');

    expect(result.map((comment) => comment.id)).toEqual([92, 91]);
    expect(result[0]).toMatchObject({
      authorPhotoUrl: 'https://signed.example.test/jordan.png',
      canDelete: true
    });
    expect(result[1]).toMatchObject({
      authorPhotoUrl: null,
      canDelete: false
    });
  });

  it('creates a comment, updates content freshness, and returns the created comment', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null
    });
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    avatarUrlResolver.resolvePhotoUrl.mockResolvedValue('https://signed.example.test/jordan.png');

    const dto = new CreateContentCommentDto();
    dto.bodyMarkdown = '  New comment  ';

    const result = await service.createComment('12', '44', 'actor-44', ['tenant_user'], '11', dto);

    expect(contentCommentRepository.createWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      expect.objectContaining({
        contentEntryId: 11,
        authorUserId: 44,
        bodyMarkdown: 'New comment'
      })
    );
    expect(repository.updateWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      11,
      expect.objectContaining({
        updatedBy: 44,
        updatedAt: expect.any(Date)
      })
    );
    expect(result).toMatchObject({
      id: 93,
      contentEntryId: 11,
      bodyMarkdown: 'Newest comment',
      canDelete: true
    });
  });

  it('deletes own comments with content update capability and soft-deletes the row', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null
    });
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    contentCommentRepository.findVisibleByIdOrThrow.mockResolvedValue({
      id: 92,
      contentEntryId: 11,
      authorUserId: 44,
      authorDisplayName: 'Jordan Lee',
      authorAvatarFileId: null,
      authorPhotoUrl: 'https://cdn.example.test/jordan.png',
      bodyMarkdown: 'Newest comment',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
      updatedAt: new Date('2026-03-28T12:00:00.000Z')
    });

    await service.deleteComment('12', '44', 'actor-44', ['tenant_user'], '11', '92');

    expect(contentCommentRepository.softDeleteWithDatabase).toHaveBeenCalledWith(
      { tx: 'content' },
      12,
      11,
      92,
      expect.any(Date)
    );
  });

  it('blocks deleting another users comment for non-admin callers', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null
    });
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 11,
      organizationId: 12,
      projectId: null,
      parentId: null,
      title: 'Home',
      slug: 'home',
      contentMarkdown: '# Home',
      position: 0,
      createdBy: 44,
      updatedBy: 44,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z')
    });
    contentCommentRepository.findVisibleByIdOrThrow.mockResolvedValue({
      id: 92,
      contentEntryId: 11,
      authorUserId: 45,
      authorDisplayName: 'Alex Carter',
      authorAvatarFileId: null,
      authorPhotoUrl: null,
      bodyMarkdown: 'Older comment',
      createdAt: new Date('2026-03-28T11:00:00.000Z'),
      updatedAt: new Date('2026-03-28T11:00:00.000Z')
    });

    await expect(
      service.deleteComment('12', '44', 'actor-44', ['tenant_user'], '11', '92')
    ).rejects.toThrow();
    expect(contentCommentRepository.softDeleteWithDatabase).not.toHaveBeenCalled();
  });
});
