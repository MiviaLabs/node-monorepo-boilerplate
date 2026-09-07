import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';

import { ProjectMemberRepository } from '../project-member.repository';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('ProjectMemberRepository', () => {
  let repository: ProjectMemberRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockDb = {
    select: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMemberRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    repository = module.get<ProjectMemberRepository>(ProjectMemberRepository);
    db = mockDb as never;

    jest.clearAllMocks();
  });

  describe('assertAssignableOrganizationMember', () => {
    it('accepts a direct organization member even when no user_tenants row exists', async () => {
      const limit = jest.fn().mockResolvedValue([{ id: 10 }]);
      const where = jest.fn().mockReturnValue({ limit });
      const leftJoin = jest.fn().mockReturnValue({ where });
      const innerJoin = jest.fn().mockReturnValue({ leftJoin });
      const from = jest.fn().mockReturnValue({ innerJoin });

      db.select.mockReturnValue({ from } as never);

      await expect(repository.assertAssignableOrganizationMember(12, 10)).resolves.toBeUndefined();

      expect(db.select).toHaveBeenCalled();
      expect(from).toHaveBeenCalled();
      expect(innerJoin).toHaveBeenCalled();
      expect(leftJoin).toHaveBeenCalled();
      expect(where).toHaveBeenCalled();
      expect(limit).toHaveBeenCalledWith(1);
    });

    it('throws when the user is not assignable to the organization', async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const where = jest.fn().mockReturnValue({ limit });
      const leftJoin = jest.fn().mockReturnValue({ where });
      const innerJoin = jest.fn().mockReturnValue({ leftJoin });
      const from = jest.fn().mockReturnValue({ innerJoin });

      db.select.mockReturnValue({ from } as never);

      await expect(repository.assertAssignableOrganizationMember(12, 999)).rejects.toThrow(
        Errors.databaserecordNotFound004({ entity: 'AssignableProjectMember' })
      );
    });
  });

  describe('addMemberWithDatabase', () => {
    it('maps unique constraint violations to project member already exists', async () => {
      const database = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockRejectedValue({
            code: '23505',
            constraint: 'project_members_project_user_uidx'
          })
        })
      };

      await expect(
        repository.addMemberWithDatabase(database as never, 12, 34, 56, 78)
      ).rejects.toThrow(Errors.databaserecordAlreadyExists003({ entity: 'ProjectMember' }));
    });
  });
});
