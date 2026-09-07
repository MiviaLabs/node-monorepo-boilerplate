import { Test } from '@nestjs/testing';
import { AUTH_PROVIDER_FACTORY } from '@package/auth';
import { OutboxRepository } from '@package/events';

import { DATABASE_PROVIDER, MAIN_DB } from '../../../../../common/database/database.constants';
import { AuthRepository } from '../../../repositories/auth.repository';
import { OrganizationRepository } from '../../../repositories/organization.repository';
import { UserIdentityRepository } from '../../../repositories/user-identity.repository';
import { PurgeSoftDeletedAccountsHandler } from '../purge-soft-deleted-accounts.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

describe('PurgeSoftDeletedAccountsHandler', () => {
  let handler: PurgeSoftDeletedAccountsHandler;
  let organizationRepository: jest.Mocked<OrganizationRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let lockClient: jest.Mocked<PoolClient>;
  const deleteTenantMock = jest.fn().mockResolvedValue(undefined);

  const tx = {} as NodePgDatabase;
  const db = {
    transaction: jest.fn().mockImplementation(async (callback) => callback(tx))
  } as unknown as jest.Mocked<NodePgDatabase>;

  const authProvider = {
    deleteUser: jest.fn().mockResolvedValue(undefined),
    validateToken: jest.fn(),
    authenticate: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    getUserInfo: jest.fn(),
    getUserInfoFromToken: jest.fn(),
    getRoles: jest.fn(),
    getRolesFromToken: jest.fn(),
    getPermissions: jest.fn(),
    getPermissionsFromToken: jest.fn(),
    isAvailable: jest.fn(),
    healthCheck: jest.fn(),
    deleteTenantUsers: jest.fn(),
    name: 'google-identity-platform',
    type: 'google-identity-platform',
    firebaseAuth: {
      tenantManager: () => ({
        deleteTenant: deleteTenantMock
      })
    }
  };

  beforeEach(async () => {
    deleteTenantMock.mockClear();
    lockClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn()
    } as unknown as jest.Mocked<PoolClient>;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurgeSoftDeletedAccountsHandler,
        {
          provide: AuthRepository,
          useValue: {
            findExpiredSoftDeleted: jest.fn().mockResolvedValue([]),
            hardDeletePermanently: jest.fn().mockResolvedValue(undefined)
          }
        },
        {
          provide: OrganizationRepository,
          useValue: {
            findExpiredSoftDeleted: jest.fn().mockResolvedValue([
              {
                id: 456,
                gcpTenantId: 'gcp-tenant-456',
                deletedAt: new Date('2024-01-01T00:00:00.000Z')
              }
            ]),
            hardDeletePermanently: jest.fn().mockResolvedValue(undefined)
          }
        },
        {
          provide: UserIdentityRepository,
          useValue: {
            findPrimaryByUserId: jest.fn()
          }
        },
        {
          provide: OutboxRepository,
          useValue: {
            insert: jest.fn().mockResolvedValue(undefined)
          }
        },
        {
          provide: AUTH_PROVIDER_FACTORY,
          useValue: {
            getDefaultProvider: jest.fn().mockReturnValue(authProvider)
          }
        },
        {
          provide: DATABASE_PROVIDER,
          useValue: {
            pool: {
              connect: jest.fn().mockResolvedValue(lockClient)
            }
          }
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get(PurgeSoftDeletedAccountsHandler);
    organizationRepository = module.get(OrganizationRepository);
    outboxRepo = module.get(OutboxRepository);
    jest.clearAllMocks();
  });

  it('purges expired organizations and deletes the provider tenant', async () => {
    await handler.handle({
      data: {
        retentionDays: 90,
        dryRun: false,
        batchSize: 100
      }
    });

    expect(organizationRepository.hardDeletePermanently).toHaveBeenCalledWith(456);
    expect(outboxRepo.insert).toHaveBeenCalled();
    expect(deleteTenantMock).toHaveBeenCalledWith('gcp-tenant-456');
    expect(lockClient.query).toHaveBeenCalledTimes(2);
    expect(lockClient.release).toHaveBeenCalledTimes(1);
  });

  it('skips the purge when another instance already holds the advisory lock', async () => {
    lockClient.query = jest.fn().mockResolvedValue({ rows: [{ acquired: false }] }) as never;

    const result = await handler.handle({
      data: {
        retentionDays: 90,
        dryRun: false,
        batchSize: 100
      }
    });

    expect(result).toEqual({
      success: true,
      totalPurged: 0,
      dryRun: false,
      usersFound: 0,
      orgsFound: 0,
      errors: []
    });
    expect(organizationRepository.findExpiredSoftDeleted).not.toHaveBeenCalled();
    expect(organizationRepository.hardDeletePermanently).not.toHaveBeenCalled();
    expect(outboxRepo.insert).not.toHaveBeenCalled();
    expect(deleteTenantMock).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(lockClient.query).toHaveBeenCalledTimes(1);
    expect(lockClient.release).toHaveBeenCalledTimes(1);
  });
});
