import { Inject, Injectable } from '@nestjs/common';
import {
  asc,
  and,
  contentEntries,
  eq,
  inArray,
  isNull,
  projects,
  users,
  sql,
  type ContentEntry,
  type NewContentEntry,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

type ContentDatabaseTarget = NodePgDatabase;

type ScopeFilter = {
  projectId?: number | null;
  parentId?: number | null;
};

type ContentEntryDetailRow = ContentEntry & {
  updatedByAvatarFileId: number | null;
  updatedByDisplayName: string | null;
  updatedByPhotoUrl: string | null;
};

type ContentSidebarEntryRow = Omit<
  ContentEntryDetailRow,
  'contentMarkdown' | 'createdBy' | 'createdAt'
>;

type CreateContentEntryInput = Omit<
  NewContentEntry,
  'organizationId' | 'id' | 'createdAt' | 'updatedAt'
>;

@Injectable()
export class ContentRepository extends BaseRepository<
  ContentEntry,
  NewContentEntry,
  Partial<NewContentEntry>,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  protected getTable(): typeof contentEntries {
    return contentEntries;
  }

  protected getIdColumn(): typeof contentEntries.id {
    return contentEntries.id;
  }

  protected getTenantColumn(): typeof contentEntries.organizationId {
    return contentEntries.organizationId;
  }

  protected getEntityName(): string {
    return 'ContentEntry';
  }

  override async findById(tenantId: number, id: number): Promise<ContentEntry | null> {
    return this.findByIdWithDatabase(this.db, tenantId, id);
  }

  async findEntryDetailByIdOrThrow(tenantId: number, id: number): Promise<ContentEntryDetailRow> {
    return this.findEntryDetailByIdOrThrowWithDatabase(this.db, tenantId, id);
  }

  async findEntryDetailByIdOrThrowWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    id: number,
    lockForUpdate = false
  ): Promise<ContentEntryDetailRow> {
    const query = database
      .select({
        id: contentEntries.id,
        organizationId: contentEntries.organizationId,
        projectId: contentEntries.projectId,
        parentId: contentEntries.parentId,
        title: contentEntries.title,
        slug: contentEntries.slug,
        contentMarkdown: contentEntries.contentMarkdown,
        position: contentEntries.position,
        createdBy: contentEntries.createdBy,
        updatedBy: contentEntries.updatedBy,
        createdAt: contentEntries.createdAt,
        updatedAt: contentEntries.updatedAt,
        deletedAt: contentEntries.deletedAt,
        updatedByDisplayName: users.displayName,
        updatedByAvatarFileId: users.avatarFileId,
        updatedByPhotoUrl: users.photoUrl
      })
      .from(contentEntries)
      .leftJoin(users, eq(users.id, contentEntries.updatedBy))
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          eq(contentEntries.id, id),
          isNull(contentEntries.deletedAt)
        )
      )
      .limit(1);

    const [entry] = await (lockForUpdate ? query.for('update') : query);
    if (!entry) {
      throw Errors.databaserecordNotFound004({ entity: 'ContentEntry' });
    }

    return entry;
  }

  async findBySlug(
    tenantId: number,
    slug: string,
    projectId: number | null
  ): Promise<ContentEntry | null> {
    const scopeFilter =
      projectId === null
        ? isNull(contentEntries.projectId)
        : eq(contentEntries.projectId, projectId);

    const [entry] = await this.db
      .select()
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          eq(contentEntries.slug, slug),
          scopeFilter,
          isNull(contentEntries.deletedAt)
        )
      )
      .limit(1);

    return entry ?? null;
  }

  async findEntryDetailBySlug(
    tenantId: number,
    slug: string,
    projectId: number | null
  ): Promise<ContentEntryDetailRow | null> {
    const scopeFilter =
      projectId === null
        ? isNull(contentEntries.projectId)
        : eq(contentEntries.projectId, projectId);

    const [entry] = await this.db
      .select({
        id: contentEntries.id,
        organizationId: contentEntries.organizationId,
        projectId: contentEntries.projectId,
        parentId: contentEntries.parentId,
        title: contentEntries.title,
        slug: contentEntries.slug,
        contentMarkdown: contentEntries.contentMarkdown,
        position: contentEntries.position,
        createdBy: contentEntries.createdBy,
        updatedBy: contentEntries.updatedBy,
        createdAt: contentEntries.createdAt,
        updatedAt: contentEntries.updatedAt,
        deletedAt: contentEntries.deletedAt,
        updatedByDisplayName: users.displayName,
        updatedByAvatarFileId: users.avatarFileId,
        updatedByPhotoUrl: users.photoUrl
      })
      .from(contentEntries)
      .leftJoin(users, eq(users.id, contentEntries.updatedBy))
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          eq(contentEntries.slug, slug),
          scopeFilter,
          isNull(contentEntries.deletedAt)
        )
      )
      .limit(1);

    return entry ?? null;
  }

  async listByScope(tenantId: number, filters: ScopeFilter): Promise<ContentEntryDetailRow[]> {
    const clauses = [eq(contentEntries.organizationId, tenantId), isNull(contentEntries.deletedAt)];

    if (filters.projectId !== undefined) {
      clauses.push(
        filters.projectId === null
          ? isNull(contentEntries.projectId)
          : eq(contentEntries.projectId, filters.projectId)
      );
    }

    if (filters.parentId !== undefined) {
      clauses.push(
        filters.parentId === null
          ? isNull(contentEntries.parentId)
          : eq(contentEntries.parentId, filters.parentId)
      );
    }

    return this.db
      .select({
        id: contentEntries.id,
        organizationId: contentEntries.organizationId,
        projectId: contentEntries.projectId,
        parentId: contentEntries.parentId,
        title: contentEntries.title,
        slug: contentEntries.slug,
        contentMarkdown: contentEntries.contentMarkdown,
        position: contentEntries.position,
        createdBy: contentEntries.createdBy,
        updatedBy: contentEntries.updatedBy,
        createdAt: contentEntries.createdAt,
        updatedAt: contentEntries.updatedAt,
        deletedAt: contentEntries.deletedAt,
        updatedByDisplayName: users.displayName,
        updatedByAvatarFileId: users.avatarFileId,
        updatedByPhotoUrl: users.photoUrl
      })
      .from(contentEntries)
      .leftJoin(users, eq(users.id, contentEntries.updatedBy))
      .where(and(...clauses))
      .orderBy(
        asc(sql<number>`coalesce(${contentEntries.parentId}, 0)`),
        asc(contentEntries.position),
        asc(contentEntries.id)
      );
  }

  async listSidebarEntriesByScope(
    tenantId: number,
    filters: ScopeFilter
  ): Promise<ContentSidebarEntryRow[]> {
    const clauses = [eq(contentEntries.organizationId, tenantId), isNull(contentEntries.deletedAt)];

    if (filters.projectId !== undefined) {
      clauses.push(
        filters.projectId === null
          ? isNull(contentEntries.projectId)
          : eq(contentEntries.projectId, filters.projectId)
      );
    }

    if (filters.parentId !== undefined) {
      clauses.push(
        filters.parentId === null
          ? isNull(contentEntries.parentId)
          : eq(contentEntries.parentId, filters.parentId)
      );
    }

    return this.db
      .select({
        id: contentEntries.id,
        organizationId: contentEntries.organizationId,
        projectId: contentEntries.projectId,
        parentId: contentEntries.parentId,
        title: contentEntries.title,
        slug: contentEntries.slug,
        position: contentEntries.position,
        updatedBy: contentEntries.updatedBy,
        updatedAt: contentEntries.updatedAt,
        deletedAt: contentEntries.deletedAt,
        updatedByDisplayName: users.displayName,
        updatedByAvatarFileId: users.avatarFileId,
        updatedByPhotoUrl: users.photoUrl
      })
      .from(contentEntries)
      .leftJoin(users, eq(users.id, contentEntries.updatedBy))
      .where(and(...clauses))
      .orderBy(
        asc(sql<number>`coalesce(${contentEntries.parentId}, 0)`),
        asc(contentEntries.position),
        asc(contentEntries.id)
      );
  }

  async listActiveSiblingsWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    projectId: number | null,
    parentId: number | null,
    lockForUpdate = false
  ): Promise<ContentEntry[]> {
    const scopeFilter =
      projectId === null
        ? isNull(contentEntries.projectId)
        : eq(contentEntries.projectId, projectId);
    const parentFilter =
      parentId === null ? isNull(contentEntries.parentId) : eq(contentEntries.parentId, parentId);
    const query = database
      .select()
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          scopeFilter,
          parentFilter,
          isNull(contentEntries.deletedAt)
        )
      )
      .orderBy(asc(contentEntries.position), asc(contentEntries.id));

    return lockForUpdate ? query.for('update') : query;
  }

  async createWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    data: CreateContentEntryInput
  ): Promise<ContentEntry> {
    try {
      const [createdEntry] = await database
        .insert(contentEntries)
        .values({
          ...data,
          organizationId: tenantId
        })
        .returning();

      if (!createdEntry) {
        throw new Error('Insert operation failed to return inserted content entry');
      }

      return createdEntry;
    } catch (error) {
      this.rethrowKnownConstraint(error);
      throw error;
    }
  }

  async updateWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    entryId: number,
    data: Partial<NewContentEntry>
  ): Promise<ContentEntry> {
    try {
      const [updatedEntry] = await database
        .update(contentEntries)
        .set(data)
        .where(
          and(
            eq(contentEntries.organizationId, tenantId),
            eq(contentEntries.id, entryId),
            isNull(contentEntries.deletedAt)
          )
        )
        .returning();

      if (!updatedEntry) {
        throw Errors.databaserecordNotFound004({ entity: 'ContentEntry' });
      }

      return updatedEntry;
    } catch (error) {
      this.rethrowKnownConstraint(error);
      throw error;
    }
  }

  async softDeleteWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    entryId: number,
    updatedBy: number
  ): Promise<void> {
    const [deletedEntry] = await database
      .update(contentEntries)
      .set({
        deletedAt: new Date(),
        updatedBy,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          eq(contentEntries.id, entryId),
          isNull(contentEntries.deletedAt)
        )
      )
      .returning({ id: contentEntries.id });

    if (!deletedEntry) {
      throw Errors.databaserecordNotFound004({ entity: 'ContentEntry' });
    }
  }

  async listActiveChildrenWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    parentIds: number[],
    projectId: number | null,
    lockForUpdate = false
  ): Promise<ContentEntry[]> {
    if (parentIds.length === 0) {
      return [];
    }

    const scopeFilter =
      projectId === null
        ? isNull(contentEntries.projectId)
        : eq(contentEntries.projectId, projectId);

    const query = database
      .select()
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          inArray(contentEntries.parentId, parentIds),
          scopeFilter,
          isNull(contentEntries.deletedAt)
        )
      );

    return lockForUpdate ? query.for('update') : query;
  }

  async collectActiveSubtreeIdsWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    rootEntry: Pick<ContentEntry, 'id' | 'projectId'>,
    lockForUpdate = false
  ): Promise<number[]> {
    const collectedIds = [rootEntry.id];
    let frontier = [rootEntry.id];

    while (frontier.length > 0) {
      const children = await this.listActiveChildrenWithDatabase(
        database,
        tenantId,
        frontier,
        rootEntry.projectId,
        lockForUpdate
      );

      if (children.length === 0) {
        break;
      }

      frontier = children.map((child) => child.id);
      collectedIds.push(...frontier);
    }

    return collectedIds;
  }

  async softDeleteManyWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    entryIds: number[],
    updatedBy: number
  ): Promise<number[]> {
    if (entryIds.length === 0) {
      return [];
    }

    const deletedEntries = await database
      .update(contentEntries)
      .set({
        deletedAt: new Date(),
        updatedBy,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          inArray(contentEntries.id, entryIds),
          isNull(contentEntries.deletedAt)
        )
      )
      .returning({ id: contentEntries.id });

    return deletedEntries.map((entry) => entry.id);
  }

  async updateSiblingPositionsWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    siblingIdsInOrder: number[],
    updatedBy: number,
    updatedAt: Date
  ): Promise<void> {
    const temporaryOffset = siblingIdsInOrder.length + 1_000;

    for (const [index, entryId] of siblingIdsInOrder.entries()) {
      await this.updateWithDatabase(database, tenantId, entryId, {
        position: temporaryOffset + index,
        updatedBy,
        updatedAt
      });
    }

    for (const [index, entryId] of siblingIdsInOrder.entries()) {
      await this.updateWithDatabase(database, tenantId, entryId, {
        position: index,
        updatedBy,
        updatedAt
      });
    }
  }

  private rethrowKnownConstraint(error: unknown): never | void {
    const pgError = this.extractConstraintError(error);

    if (
      pgError?.code === '23505' &&
      [
        'content_entries_org_slug_active_uidx',
        'content_entries_project_slug_active_uidx',
        'content_entries_active_sibling_position_uidx'
      ].includes(pgError.constraint)
    ) {
      throw Errors.databaserecordAlreadyExists003({ entity: 'ContentEntry' });
    }
  }

  async ensureSlugAvailable(
    tenantId: number,
    slug: string,
    projectId: number | null,
    excludeId?: number
  ): Promise<void> {
    const existing = await this.findBySlug(tenantId, slug, projectId);
    if (existing && existing.id !== excludeId) {
      throw Errors.databaserecordAlreadyExists003({ entity: 'ContentEntry' });
    }
  }

  async ensureProjectBelongsToOrganization(tenantId: number, projectId: number): Promise<void> {
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, tenantId),
          eq(projects.id, projectId),
          isNull(projects.deletedAt)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.databaserecordNotFound004({ entity: 'Project' });
    }
  }

  async ensureParentInSameScope(
    tenantId: number,
    parentId: number,
    projectId: number | null,
    database: ContentDatabaseTarget = this.db,
    lockForUpdate = false
  ): Promise<ContentEntry> {
    const parent = await this.findByIdOrThrowWithDatabase(
      database,
      tenantId,
      parentId,
      lockForUpdate
    );
    if (parent.projectId !== projectId) {
      throw Errors.validationvalidationFailedField001({ field: 'parentId' });
    }

    return parent;
  }

  async hasActiveChildren(tenantId: number, entryId: number): Promise<boolean> {
    return this.hasActiveChildrenWithDatabase(this.db, tenantId, entryId);
  }

  async hasActiveChildrenWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    entryId: number
  ): Promise<boolean> {
    const [child] = await database
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          eq(contentEntries.parentId, entryId),
          isNull(contentEntries.deletedAt)
        )
      )
      .limit(1);

    return child !== undefined;
  }

  async ensureNoCycleOnReparent(
    tenantId: number,
    entryId: number,
    parentId: number | null,
    database: ContentDatabaseTarget = this.db
  ): Promise<void> {
    if (parentId === null) {
      return;
    }

    if (entryId === parentId) {
      throw Errors.validationvalidationFailedField001({ field: 'parentId' });
    }

    const entry = await this.findByIdOrThrowWithDatabase(database, tenantId, entryId);
    let currentParent = await this.ensureParentInSameScope(
      tenantId,
      parentId,
      entry.projectId,
      database,
      true
    );

    while (currentParent.parentId !== null) {
      if (currentParent.parentId === entryId) {
        throw Errors.validationvalidationFailedField001({ field: 'parentId' });
      }
      currentParent = await this.findByIdOrThrowWithDatabase(
        database,
        tenantId,
        currentParent.parentId,
        true
      );
    }
  }

  async findByIdOrThrowWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    id: number,
    lockForUpdate = false
  ): Promise<ContentEntry> {
    const entry = await this.findByIdWithDatabase(database, tenantId, id, lockForUpdate);
    if (!entry) {
      throw Errors.databaserecordNotFound004({ entity: 'ContentEntry' });
    }

    return entry;
  }

  private extractConstraintError(error: unknown):
    | {
        code?: unknown;
        constraint: string;
      }
    | undefined {
    if (
      typeof error === 'object' &&
      error !== null &&
      'constraint' in error &&
      typeof error.constraint === 'string'
    ) {
      return {
        code: 'code' in error ? error.code : undefined,
        constraint: error.constraint
      };
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'cause' in error &&
      typeof error.cause === 'object' &&
      error.cause !== null &&
      'constraint' in error.cause &&
      typeof error.cause.constraint === 'string'
    ) {
      return {
        code: 'code' in error.cause ? error.cause.code : undefined,
        constraint: error.cause.constraint
      };
    }

    return undefined;
  }

  private async findByIdWithDatabase(
    database: ContentDatabaseTarget,
    tenantId: number,
    id: number,
    lockForUpdate = false
  ): Promise<ContentEntry | null> {
    const query = database
      .select()
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.organizationId, tenantId),
          eq(contentEntries.id, id),
          isNull(contentEntries.deletedAt)
        )
      )
      .limit(1);

    const [entry] = lockForUpdate ? await query.for('update') : await query;
    return entry ?? null;
  }
}
