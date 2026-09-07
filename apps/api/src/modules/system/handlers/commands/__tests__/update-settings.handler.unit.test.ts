/**
 * Unit Tests for UpdateSettingsHandler
 *
 * Tests system settings update with transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { UpdateSettingsCommand } from '../../../commands/update-settings.command';
import { TenantRepository } from '../../../repositories/tenant.repository';
import { UpdateSettingsHandler } from '../update-settings.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('UpdateSettingsHandler', () => {
  let handler: UpdateSettingsHandler;
  let tenantRepo: jest.Mocked<TenantRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
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
      allowRegistration: true,
      requireEmailVerification: true,
      defaultUserRole: 'tenant_user'
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
      where: jest.fn().mockReturnThis(),
      returning: jest.fn()
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

    const mockAuditOutbox = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateSettingsHandler,
        {
          provide: TenantRepository,
          useValue: mockTenantRepo
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: AuditOutboxPublisher,
          useValue: mockAuditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<UpdateSettingsHandler>(UpdateSettingsHandler);
    tenantRepo = module.get(TenantRepository);
    outboxRepo = module.get(OutboxRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  describe('validation', () => {
    it('should throw VAL_001 if settings is not an object', async () => {
      const command = new UpdateSettingsCommand({
        tenantId: 1,
        actorId: '5',
        settings: null as unknown as Record<string, unknown>
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_001'
      });
    });

    it('should throw VAL_001 if settings is missing', async () => {
      const command = new UpdateSettingsCommand({
        tenantId: 1,
        actorId: '5',
        settings: undefined as unknown as Record<string, unknown>
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_001'
      });
    });
  });

  describe('success', () => {
    it('should merge settings with existing and publish event', async () => {
      const newSettings = {
        allowRegistration: false,
        maxTenantsPerUser: 5
      };

      const command = new UpdateSettingsCommand({
        tenantId: 1,
        actorId: '5',
        settings: newSettings,
        requestId: 'req-settings-1',
        correlationId: 'corr-settings-1',
        causationId: 'cause-settings-1'
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue(mockTenant);

      // Mock update returning
      (dbTransaction.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                ...mockTenant,
                settings: {
                  ...mockTenant.settings,
                  ...newSettings
                }
              }
            ])
          })
        })
      });

      const result = await handler.execute(command);

      // Verify transaction was called
      expect(db.transaction).toHaveBeenCalled();

      // Verify outbox event
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'tenant.settings.updated',
          aggregateId: '1',
          payload: expect.objectContaining({
            tenantId: '1',
            changes: newSettings,
            updatedBy: '5'
          })
        })
      );
      expect(auditOutbox.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'system.settings.updated.audit',
          correlationId: 'corr-settings-1',
          causationId: 'cause-settings-1',
          payload: expect.objectContaining({
            requestId: 'req-settings-1',
            details: expect.objectContaining({
              updatedSettingKeys: ['allowRegistration', 'maxTenantsPerUser']
            })
          })
        })
      );
      const auditDetails = (
        (auditOutbox.insert as jest.Mock).mock.calls[0]?.[1]?.payload as {
          details?: Record<string, unknown>;
        }
      ).details;
      expect(auditDetails).toEqual({
        updatedSettingKeys: ['allowRegistration', 'maxTenantsPerUser']
      });

      // Verify merged settings
      expect(result.allowRegistration).toBe(false);
      expect(result.requireEmailVerification).toBe(true); // Preserved from existing
      expect(result.maxTenantsPerUser).toBe(5);
    });

    it('should use default values for missing settings', async () => {
      const command = new UpdateSettingsCommand({
        tenantId: 1,
        actorId: '5',
        settings: {}
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue({
        ...mockTenant,
        settings: {} // Empty existing settings
      });

      (dbTransaction.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockTenant])
          })
        })
      });

      const result = await handler.execute(command);

      // Verify defaults are applied
      expect(result.allowRegistration).toBe(true);
      expect(result.requireEmailVerification).toBe(true);
      expect(result.defaultUserRole).toBe('tenant_user');
      expect(result.maxTenantsPerUser).toBe(1);
      expect(result.sessionTimeout).toBe(3600);
      expect(result.passwordPolicy).toEqual({
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false
      });
    });
  });
});
