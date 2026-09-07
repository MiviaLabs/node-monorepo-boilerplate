import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';

import { ContentRepository } from '../content.repository';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('ContentRepository', () => {
  let repository: ContentRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockDb = {
    select: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    repository = module.get(ContentRepository);
    db = mockDb as never;

    jest.clearAllMocks();
  });

  describe('ensureSlugAvailable', () => {
    it('throws when the same slug already exists in scope', async () => {
      jest.spyOn(repository, 'findBySlug').mockResolvedValue({
        id: 11
      } as never);

      await expect(repository.ensureSlugAvailable(12, 'home', null)).rejects.toThrow(
        Errors.databaserecordAlreadyExists003({ entity: 'ContentEntry' })
      );
    });

    it('allows the existing row when excludeId matches', async () => {
      jest.spyOn(repository, 'findBySlug').mockResolvedValue({
        id: 11
      } as never);

      await expect(repository.ensureSlugAvailable(12, 'home', null, 11)).resolves.toBeUndefined();
    });
  });

  describe('ensureProjectBelongsToOrganization', () => {
    it('throws when the project does not belong to the tenant', async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });

      db.select.mockReturnValue({ from } as never);

      await expect(repository.ensureProjectBelongsToOrganization(12, 77)).rejects.toThrow(
        Errors.databaserecordNotFound004({ entity: 'Project' })
      );
    });
  });

  describe('ensureParentInSameScope', () => {
    it('throws when parent scope differs from the requested scope', async () => {
      jest.spyOn(repository, 'findByIdOrThrowWithDatabase').mockResolvedValue({
        id: 22,
        projectId: 88
      } as never);

      await expect(repository.ensureParentInSameScope(12, 22, null)).rejects.toThrow(
        Errors.validationvalidationFailedField001({ field: 'parentId' })
      );
    });
  });

  describe('ensureNoCycleOnReparent', () => {
    it('rejects reparenting into a descendant chain', async () => {
      jest
        .spyOn(repository, 'findByIdOrThrowWithDatabase')
        .mockResolvedValueOnce({
          id: 10,
          projectId: null,
          parentId: null
        } as never)
        .mockResolvedValueOnce({
          id: 30,
          projectId: null,
          parentId: 20
        } as never)
        .mockResolvedValueOnce({
          id: 20,
          projectId: null,
          parentId: 10
        } as never);
      jest.spyOn(repository, 'ensureParentInSameScope').mockResolvedValue({
        id: 30,
        projectId: null,
        parentId: 20
      } as never);

      await expect(repository.ensureNoCycleOnReparent(12, 10, 30)).rejects.toThrow(
        Errors.validationvalidationFailedField001({ field: 'parentId' })
      );
    });
  });

  describe('createWithDatabase', () => {
    it('maps slug unique constraint violations to content entry already exists', async () => {
      const database = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockRejectedValue({
              code: '23505',
              constraint: 'content_entries_org_slug_active_uidx'
            })
          })
        })
      };

      await expect(
        repository.createWithDatabase(database as never, 12, {
          projectId: null,
          parentId: null,
          title: 'Home',
          slug: 'home',
          contentMarkdown: '# Home',
          createdBy: 44,
          updatedBy: 44
        })
      ).rejects.toThrow(Errors.databaserecordAlreadyExists003({ entity: 'ContentEntry' }));
    });

    it('maps wrapped Drizzle slug unique constraint violations to content entry already exists', async () => {
      const database = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockRejectedValue({
              cause: {
                code: '23505',
                constraint: 'content_entries_project_slug_active_uidx'
              }
            })
          })
        })
      };

      await expect(
        repository.createWithDatabase(database as never, 12, {
          projectId: 77,
          parentId: null,
          title: 'Home',
          slug: 'home',
          contentMarkdown: '# Home',
          createdBy: 44,
          updatedBy: 44
        })
      ).rejects.toThrow(Errors.databaserecordAlreadyExists003({ entity: 'ContentEntry' }));
    });
  });
});
