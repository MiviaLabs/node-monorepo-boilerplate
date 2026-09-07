/**
 * RotateEncryptedStoreKeyHandler Unit Tests
 *
 * Tests the command handler for rotating encrypted-store encryption keys.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { RotateEncryptedStoreKeyCommand } from '../../../commands';
import { RotationTriggerSource } from '../../../jobs/encrypted-store-key-rotation.job';
import { KmsRotationOrchestratorService } from '../../../services/kms-rotation-orchestrator.service';
import { RotateEncryptedStoreKeyHandler } from '../rotate-encrypted-store-key.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('RotateEncryptedStoreKeyHandler', () => {
  let handler: RotateEncryptedStoreKeyHandler;
  let orchestrator: jest.Mocked<KmsRotationOrchestratorService>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
  let db: jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;

  beforeEach(async () => {
    const mockOrchestrator = {
      queueTenantRotation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    };
    const mockAuditOutbox = {
      insert: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    };
    db = {} as jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RotateEncryptedStoreKeyHandler,
        {
          provide: KmsRotationOrchestratorService,
          useValue: mockOrchestrator
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

    handler = module.get<RotateEncryptedStoreKeyHandler>(RotateEncryptedStoreKeyHandler);
    orchestrator = module.get(KmsRotationOrchestratorService);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  describe('execute', () => {
    it('should queue tenant rotation with command parameters', async () => {
      // Arrange
      const command = new RotateEncryptedStoreKeyCommand({
        tenantId: 123,
        actorId: 7,
        oldKeyId: 'primary-encryption-key/v1',
        newKeyId: 'primary-encryption-key/v2'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(orchestrator.queueTenantRotation).toHaveBeenCalledWith({
        tenantId: 123,
        oldKeyId: 'primary-encryption-key/v1',
        newKeyId: 'primary-encryption-key/v2',
        actorId: 7,
        requestId: undefined,
        correlationId: undefined,
        causationId: undefined,
        triggerSource: RotationTriggerSource.Manual
      });
      expect(auditOutbox.insert).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          eventType: 'vault.key.rotation.requested.audit',
          payload: expect.objectContaining({
            details: expect.objectContaining({
              executionMode: 'async',
              queued: true
            })
          })
        })
      );
    });

    it('should return success result', async () => {
      // Arrange
      const command = new RotateEncryptedStoreKeyCommand({
        tenantId: 123,
        actorId: 7,
        oldKeyId: 'old-key',
        newKeyId: 'new-key'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should propagate service errors', async () => {
      // Arrange
      orchestrator.queueTenantRotation.mockRejectedValue(new Error('Key rotation failed'));
      const command = new RotateEncryptedStoreKeyCommand({
        tenantId: 123,
        actorId: 7,
        oldKeyId: 'old-key',
        newKeyId: 'new-key'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Key rotation failed');
    });

    it('should forward request trace metadata', async () => {
      const command = new RotateEncryptedStoreKeyCommand({
        tenantId: 123,
        actorId: 7,
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        requestId: 'req-rotate',
        correlationId: 'corr-rotate',
        causationId: 'cause-rotate'
      });

      await handler.execute(command);

      expect(orchestrator.queueTenantRotation).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-rotate',
          correlationId: 'corr-rotate',
          causationId: 'cause-rotate'
        })
      );
    });
  });
});
