import assert from 'node:assert/strict';

import { contentEntries, organizations, projects, tenants } from '@package/db-core';
import { Errors } from '@package/errors';
import { eq } from 'drizzle-orm';

import { createUserFixtureWithDb } from '../../../../../test/fixtures/user.fixture';
import { ContentRepository } from '../content.repository';

jest.setTimeout(30000);

describe('ContentRepository Integration', () => {
  type RepositoryDb = ConstructorParameters<typeof ContentRepository>[0];

  let db: RepositoryDb;
  let teardownDb: () => Promise<void> = async () => {};
  let repository: ContentRepository;

  let organizationAId: number;
  let organizationBId: number;
  let userAId: number;
  let userBId: number;
  let projectAId: number;
  let projectBId: number;
  let foreignProjectId: number;

  beforeAll(async () => {
    const testUtils = await import('@package/test-utils');
    await testUtils.setupTestDatabaseJest();
    db = testUtils.getTestDb().db as unknown as RepositoryDb;
    teardownDb = testUtils.teardownTestDatabase;
    repository = new ContentRepository(db as never);

    const [tenantA] = await db
      .insert(tenants)
      .values({ type: 'organization', status: 'active' })
      .returning({ id: tenants.id });
    const [tenantB] = await db
      .insert(tenants)
      .values({ type: 'organization', status: 'active' })
      .returning({ id: tenants.id });

    assert.ok(tenantA);
    assert.ok(tenantB);

    const [organizationA] = await db
      .insert(organizations)
      .values({
        tenantId: tenantA.id,
        name: 'Content Repo Org A',
        slug: `content-repo-org-a-${Date.now()}`,
        isActive: true
      })
      .returning({ id: organizations.id });
    const [organizationB] = await db
      .insert(organizations)
      .values({
        tenantId: tenantB.id,
        name: 'Content Repo Org B',
        slug: `content-repo-org-b-${Date.now()}`,
        isActive: true
      })
      .returning({ id: organizations.id });

    assert.ok(organizationA);
    assert.ok(organizationB);

    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    const userA = await createUserFixtureWithDb(db as never, {
      organizationId: organizationAId
    });
    const userB = await createUserFixtureWithDb(db as never, {
      organizationId: organizationBId
    });

    userAId = userA.id;
    userBId = userB.id;

    const insertedProjects = await db
      .insert(projects)
      .values([
        {
          organizationId: organizationAId,
          createdBy: userAId,
          key: 'PA',
          name: 'Project A',
          visibility: 'private'
        },
        {
          organizationId: organizationAId,
          createdBy: userAId,
          key: 'PB',
          name: 'Project B',
          visibility: 'private'
        },
        {
          organizationId: organizationBId,
          createdBy: userBId,
          key: 'FP',
          name: 'Foreign Project',
          visibility: 'private'
        }
      ])
      .returning({ id: projects.id, organizationId: projects.organizationId });

    const [projectA, projectB, foreignProject] = insertedProjects;
    assert.ok(projectA);
    assert.ok(projectB);
    assert.ok(foreignProject);

    projectAId = projectA.id;
    projectBId = projectB.id;
    foreignProjectId = foreignProject.id;
  });

  beforeEach(async () => {
    await db.delete(contentEntries).where(eq(contentEntries.organizationId, organizationAId));
    await db.delete(contentEntries).where(eq(contentEntries.organizationId, organizationBId));
  });

  afterAll(async () => {
    await teardownDb();
  });

  it('keeps reads tenant-scoped even when slugs match across organizations', async () => {
    await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: null,
      title: 'Home A',
      slug: 'home',
      contentMarkdown: '# Home A',
      createdBy: userAId,
      updatedBy: userAId
    });
    const orgBEntry = await repository.createWithDatabase(db as never, organizationBId, {
      projectId: null,
      parentId: null,
      title: 'Home B',
      slug: 'home',
      contentMarkdown: '# Home B',
      createdBy: userBId,
      updatedBy: userBId
    });

    const found = await repository.findBySlug(organizationBId, 'home', null);
    const scopedList = await repository.listByScope(organizationAId, {
      projectId: null,
      parentId: null
    });

    expect(found?.id).toBe(orgBEntry.id);
    expect(scopedList).toHaveLength(1);
    expect(scopedList[0]?.organizationId).toBe(organizationAId);
  });

  it('does not treat omitted list filters as null-scope constraints', async () => {
    const projectRoot = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: projectAId,
      parentId: null,
      title: 'Project Root',
      slug: 'project-root',
      contentMarkdown: '# Project Root',
      createdBy: userAId,
      updatedBy: userAId
    });

    await repository.createWithDatabase(db as never, organizationAId, {
      projectId: projectAId,
      parentId: projectRoot.id,
      title: 'Project Child',
      slug: 'project-child',
      contentMarkdown: '# Project Child',
      createdBy: userAId,
      updatedBy: userAId
    });

    await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: null,
      title: 'Org Root',
      slug: 'org-root',
      contentMarkdown: '# Org Root',
      createdBy: userAId,
      updatedBy: userAId
    });

    const tenantWideList = await repository.listByScope(organizationAId, {});
    const projectWideList = await repository.listByScope(organizationAId, {
      projectId: projectAId
    });

    expect(tenantWideList).toHaveLength(3);
    expect(projectWideList).toHaveLength(2);
    expect(projectWideList.map((entry) => entry.slug).sort()).toEqual([
      'project-child',
      'project-root'
    ]);
  });

  it('returns sibling groups ordered by persisted position', async () => {
    const rootA = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: null,
      title: 'Root A',
      slug: 'root-a',
      contentMarkdown: '# Root A',
      position: 1,
      createdBy: userAId,
      updatedBy: userAId
    });
    const rootB = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: null,
      title: 'Root B',
      slug: 'root-b',
      contentMarkdown: '# Root B',
      position: 0,
      createdBy: userAId,
      updatedBy: userAId
    });
    await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: rootA.id,
      title: 'Child B',
      slug: 'child-b',
      contentMarkdown: '# Child B',
      position: 1,
      createdBy: userAId,
      updatedBy: userAId
    });
    await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: rootA.id,
      title: 'Child A',
      slug: 'child-a',
      contentMarkdown: '# Child A',
      position: 0,
      createdBy: userAId,
      updatedBy: userAId
    });

    const ordered = await repository.listByScope(organizationAId, {});

    expect(ordered.map((entry) => entry.slug)).toEqual(['root-b', 'root-a', 'child-a', 'child-b']);
    expect(rootB.position).toBe(0);
  });

  it('enforces scope-aware slug uniqueness while allowing duplicates across projects', async () => {
    await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: null,
      title: 'Org Home',
      slug: 'home',
      contentMarkdown: '# Org Home',
      createdBy: userAId,
      updatedBy: userAId
    });

    await expect(
      repository.createWithDatabase(db as never, organizationAId, {
        projectId: null,
        parentId: null,
        title: 'Org Home Duplicate',
        slug: 'home',
        contentMarkdown: '# Duplicate',
        createdBy: userAId,
        updatedBy: userAId
      })
    ).rejects.toThrow(Errors.databaserecordAlreadyExists003({ entity: 'ContentEntry' }));

    await expect(
      repository.createWithDatabase(db as never, organizationAId, {
        projectId: projectAId,
        parentId: null,
        title: 'Project A Home',
        slug: 'home',
        contentMarkdown: '# Project A Home',
        createdBy: userAId,
        updatedBy: userAId
      })
    ).resolves.toMatchObject({ projectId: projectAId });

    await expect(
      repository.createWithDatabase(db as never, organizationAId, {
        projectId: projectBId,
        parentId: null,
        title: 'Project B Home',
        slug: 'home',
        contentMarkdown: '# Project B Home',
        createdBy: userAId,
        updatedBy: userAId
      })
    ).resolves.toMatchObject({ projectId: projectBId });
  });

  it('rejects a project that belongs to another organization', async () => {
    await expect(
      repository.ensureProjectBelongsToOrganization(organizationAId, foreignProjectId)
    ).rejects.toThrow(Errors.databaserecordNotFound004({ entity: 'Project' }));
  });

  it('rejects reparenting an entry into its own descendant chain', async () => {
    const root = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: null,
      title: 'Root',
      slug: 'root',
      contentMarkdown: '# Root',
      createdBy: userAId,
      updatedBy: userAId
    });
    const child = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: root.id,
      title: 'Child',
      slug: 'child',
      contentMarkdown: '# Child',
      createdBy: userAId,
      updatedBy: userAId
    });
    const grandchild = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: child.id,
      title: 'Grandchild',
      slug: 'grandchild',
      contentMarkdown: '# Grandchild',
      createdBy: userAId,
      updatedBy: userAId
    });

    await expect(
      repository.ensureNoCycleOnReparent(organizationAId, root.id, grandchild.id)
    ).rejects.toThrow(Errors.validationvalidationFailedField001({ field: 'parentId' }));
  });

  it('collects and soft deletes an entire active subtree without touching sibling branches', async () => {
    const root = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: null,
      title: 'Root',
      slug: 'root',
      contentMarkdown: '# Root',
      position: 0,
      createdBy: userAId,
      updatedBy: userAId
    });
    const child = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: root.id,
      title: 'Child',
      slug: 'child',
      contentMarkdown: '# Child',
      position: 0,
      createdBy: userAId,
      updatedBy: userAId
    });
    const grandchild = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: child.id,
      title: 'Grandchild',
      slug: 'grandchild',
      contentMarkdown: '# Grandchild',
      position: 0,
      createdBy: userAId,
      updatedBy: userAId
    });
    const siblingRoot = await repository.createWithDatabase(db as never, organizationAId, {
      projectId: null,
      parentId: null,
      title: 'Sibling Root',
      slug: 'sibling-root',
      contentMarkdown: '# Sibling Root',
      position: 1,
      createdBy: userAId,
      updatedBy: userAId
    });

    const subtreeIds = await repository.collectActiveSubtreeIdsWithDatabase(
      db as never,
      organizationAId,
      root,
      true
    );
    const deletedIds = await repository.softDeleteManyWithDatabase(
      db as never,
      organizationAId,
      subtreeIds,
      userAId
    );
    const tenantWideList = await repository.listByScope(organizationAId, {});

    expect(subtreeIds.sort((left, right) => left - right)).toEqual(
      [root.id, child.id, grandchild.id].sort((left, right) => left - right)
    );
    expect(deletedIds.sort((left, right) => left - right)).toEqual(
      [root.id, child.id, grandchild.id].sort((left, right) => left - right)
    );
    expect(tenantWideList.map((entry) => entry.id)).toEqual([siblingRoot.id]);
  });
});
