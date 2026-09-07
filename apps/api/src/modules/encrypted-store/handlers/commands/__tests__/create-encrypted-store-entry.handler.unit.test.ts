/**
 * CreateEncryptedStoreEntryHandler Unit Tests
 *
 * Tests the command handler for creating encrypted-store entries.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { CreateEncryptedStoreEntryCommand } from '../../../commands';
import { EncryptedStoreService } from '../../../encrypted-store.service';
import { CreateEncryptedStoreEntryHandler } from '../create-encrypted-store-entry.handler';

import type { CreateEncryptedStoreEntryResult } from '../../../commands';
import type { TestingModule } from '@nestjs/testing';

describe('CreateEncryptedStoreEntryHandler', () => {
  let handler: CreateEncryptedStoreEntryHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let encryptedStoreService: any;

  beforeEach(async () => {
    const mockencryptedStoreService = {
      store: jest.fn<() => Promise<number>>().mockResolvedValue(1)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateEncryptedStoreEntryHandler,
        {
          provide: EncryptedStoreService,
          useValue: mockencryptedStoreService
        }
      ]
    }).compile();

    handler = module.get<CreateEncryptedStoreEntryHandler>(CreateEncryptedStoreEntryHandler);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    encryptedStoreService = module.get(EncryptedStoreService);
  });

  describe('execute', () => {
    it('should call encryptedStoreService.store with command parameters', async () => {
      // Arrange
      const command = new CreateEncryptedStoreEntryCommand({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        value: 'test@example.com'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(encryptedStoreService.store).toHaveBeenCalledWith({
        tenantId: 123,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        value: 'test@example.com',
        storedBy: 7,
        classification: undefined,
        requestId: undefined,
        correlationId: undefined,
        causationId: undefined,
        emitAuditEvent: true
      });
    });

    it('should return success result with encrypted-store entry ID', async () => {
      // Arrange
      encryptedStoreService.store.mockResolvedValue(42);
      const command = new CreateEncryptedStoreEntryCommand({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        value: 'test@example.com'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ vaultEntryId: 42 } as CreateEncryptedStoreEntryResult);
    });

    it('should handle optional classification', async () => {
      // Arrange
      const command = new CreateEncryptedStoreEntryCommand({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        value: 'test@example.com',
        classification: 'confidential'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(encryptedStoreService.store).toHaveBeenCalledWith(
        expect.objectContaining({
          classification: 'confidential'
        })
      );
    });

    it('should forward request trace metadata', async () => {
      const command = new CreateEncryptedStoreEntryCommand({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        value: 'test@example.com',
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      });

      await handler.execute(command);

      expect(encryptedStoreService.store).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-1',
          correlationId: 'corr-1',
          causationId: 'cause-1'
        })
      );
    });

    it('should propagate service errors', async () => {
      // Arrange
      encryptedStoreService.store.mockRejectedValue(new Error('Encryption failed'));
      const command = new CreateEncryptedStoreEntryCommand({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        value: 'test@example.com'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Encryption failed');
    });
  });
});
