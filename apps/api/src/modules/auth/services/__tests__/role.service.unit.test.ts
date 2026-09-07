import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RoleService } from '@package/auth';
import { SYSTEM_ROLE } from '@package/constants';

jest.mock('@package/db-core', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn()
  },
  organizations: {
    id: 'id',
    tenantId: 'tenantId'
  },
  userRoles: {
    userId: 'userId',
    role: 'role',
    expiresAt: 'expiresAt'
  },
  userTenants: {
    userId: 'userId',
    tenantId: 'tenantId',
    role: 'role',
    isActive: 'isActive'
  }
}));

const { db: mockDb } = jest.requireMock('@package/db-core') as {
  db: {
    select: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
  };
};

describe('RoleService', () => {
  let service: RoleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RoleService();
  });

  describe('assignSystemRole', () => {
    it('assigns a valid system role', async () => {
      mockDb.select.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => []
          })
        })
      });

      mockDb.insert.mockReturnValue({
        values: async () => undefined
      });

      const result = await service.assignSystemRole(7, SYSTEM_ROLE.ADMIN, 1);

      expect(result).toEqual({
        success: true,
        role: SYSTEM_ROLE.ADMIN,
        userId: 7
      });
    });

    it('rejects invalid system role values', async () => {
      await expect(service.assignSystemRole(7, 'invalid_role', 1)).rejects.toBeInstanceOf(
        ConflictException
      );
    });
  });

  describe('revokeSystemRole', () => {
    it('blocks system_admin from revoking system_owner', async () => {
      jest.spyOn(service, 'getSystemRoles').mockResolvedValue([SYSTEM_ROLE.ADMIN]);

      const promise = service.revokeSystemRole(99, SYSTEM_ROLE.OWNER, 7);

      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toThrow('Only system owners can revoke system_owner role');
    });

    it('blocks revoking system_owner without actor context', async () => {
      const promise = service.revokeSystemRole(99, SYSTEM_ROLE.OWNER);

      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toThrow('Revoking system_owner requires actor context');
    });

    it('allows system_owner to revoke system_owner', async () => {
      jest.spyOn(service, 'getSystemRoles').mockResolvedValue([SYSTEM_ROLE.OWNER]);
      mockDb.delete.mockReturnValue({
        where: () => ({
          returning: async () => [{ userId: 99 }]
        })
      });

      await expect(service.revokeSystemRole(99, SYSTEM_ROLE.OWNER, 1)).resolves.toBe(true);
    });
  });
});
