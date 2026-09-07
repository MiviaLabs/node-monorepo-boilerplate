/**
 * Unit Tests for UpdateTenantSettingsHandler
 *
 * Tests tenant settings update with transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { TenantResolutionService } from '../../../../../common/services/tenant-resolution.service';
import { TenantRepository } from '../../../../system/repositories/tenant.repository';
import { UpdateTenantSettingsCommand } from '../../../commands/update-tenant-settings.command';
import { UpdateTenantSettingsHandler } from '../update-tenant-settings.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('UpdateTenantSettingsHandler', () => {
  let handler: UpdateTenantSettingsHandler;
  let tenantRepo: jest.Mocked<TenantRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let tenantResolutionService: { invalidateTenantCache: jest.Mock };
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;

  const mockTenant: {
    id: number;
    type: 'organization';
    status: 'active';
    settings: Record<string, unknown>;
    publicId: string;
    createdAt: Date;
    updatedAt: Date;
  } = {
    id: 1,
    type: 'organization' as const,
    status: 'active' as const,
    settings: {
      featureFlags: { betaFeatures: true }
    },
    publicId: 'abc123',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z')
  };

  beforeEach(async () => {
    // Mock transaction
    dbTransaction = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis()
    } as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockTenantRepo = {
      findByIdOrThrow: jest.fn().mockResolvedValue(mockTenant)
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };
    tenantResolutionService = {
      invalidateTenantCache: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateTenantSettingsHandler,
        {
          provide: TenantRepository,
          useValue: mockTenantRepo
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: TenantResolutionService,
          useValue: tenantResolutionService
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<UpdateTenantSettingsHandler>(UpdateTenantSettingsHandler);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    tenantRepo = module.get(TenantRepository);
    outboxRepo = module.get(OutboxRepository);
  });

  describe('validation', () => {
    it('should throw VAL_002 if tenantId is not a positive integer', async () => {
      const command = new UpdateTenantSettingsCommand({
        tenantId: 'invalid',
        actorId: '5',
        settings: {
          displayName: 'Updated Name'
        }
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });
  });

  describe('success', () => {
    it('should update organization display name and publish event', async () => {
      const command = new UpdateTenantSettingsCommand({
        tenantId: '1',
        actorId: '5',
        settings: {
          displayName: 'Updated Organization'
        }
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue(mockTenant);

      const result = await handler.execute(command);

      // Verify transaction was called
      expect(db.transaction).toHaveBeenCalled();

      // Verify outbox event
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.settings.updated',
          aggregateId: '1',
          payload: expect.objectContaining({
            tenantId: '1',
            changes: expect.objectContaining({
              displayName: 'Updated Organization'
            }),
            updatedBy: '5'
          })
        })
      );
      expect(tenantResolutionService.invalidateTenantCache).toHaveBeenCalledWith(1);

      expect(result).toEqual({ displayName: 'Updated Organization' });
    });

    it('should update organization isActive and publish event', async () => {
      const command = new UpdateTenantSettingsCommand({
        tenantId: '1',
        actorId: '5',
        settings: {
          isActive: false
        }
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue(mockTenant);

      const result = await handler.execute(command);

      expect(db.transaction).toHaveBeenCalled();

      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: expect.objectContaining({
            changes: expect.objectContaining({
              isActive: false
            })
          })
        })
      );

      expect(result).toEqual({ isActive: false });
    });

    it('should merge tenant settings and publish event', async () => {
      const command = new UpdateTenantSettingsCommand({
        tenantId: '1',
        actorId: '5',
        settings: {
          settings: {
            newFeature: true,
            featureFlags: { betaFeatures: false }
          }
        }
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue(mockTenant);

      const result = await handler.execute(command);

      expect(db.transaction).toHaveBeenCalled();

      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: expect.objectContaining({
            changes: expect.objectContaining({
              settings: expect.objectContaining({
                newFeature: true,
                featureFlags: { betaFeatures: false }
              })
            })
          })
        })
      );

      // Settings should be merged
      expect(result['settings']).toBeDefined();
    });

    it('should update multiple fields in one transaction', async () => {
      const command = new UpdateTenantSettingsCommand({
        tenantId: '1',
        actorId: '5',
        settings: {
          displayName: 'New Name',
          isActive: false,
          settings: {
            setting1: 'value1'
          }
        }
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue(mockTenant);

      const result = await handler.execute(command);

      // All changes should be in the same transaction
      expect(db.transaction).toHaveBeenCalledTimes(1);

      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: expect.objectContaining({
            changes: expect.objectContaining({
              displayName: 'New Name',
              isActive: false,
              settings: expect.any(Object)
            })
          })
        })
      );

      expect(result['displayName']).toBe('New Name');
      expect(result['isActive']).toBe(false);
      expect(result['settings']).toBeDefined();
    });
  });
});
