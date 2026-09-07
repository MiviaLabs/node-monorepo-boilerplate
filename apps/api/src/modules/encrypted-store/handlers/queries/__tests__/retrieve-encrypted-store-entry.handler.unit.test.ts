/**
 * RetrieveEncryptedStoreEntryHandler Unit Tests
 *
 * Tests the query handler for retrieving encrypted-store entries.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { RetrieveEncryptedStoreEntryQuery } from '../../../queries';
import { EncryptedStoreService } from '../../../encrypted-store.service';
import { RetrieveEncryptedStoreEntryHandler } from '../retrieve-encrypted-store-entry.handler';

import type { TestingModule } from '@nestjs/testing';

describe('RetrieveEncryptedStoreEntryHandler', () => {
  let handler: RetrieveEncryptedStoreEntryHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let encryptedStoreService: any;

  beforeEach(async () => {
    const mockencryptedStoreService = {
      retrieve: jest.fn<() => Promise<string>>().mockResolvedValue('decrypted-value')
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrieveEncryptedStoreEntryHandler,
        {
          provide: EncryptedStoreService,
          useValue: mockencryptedStoreService
        }
      ]
    }).compile();

    handler = module.get<RetrieveEncryptedStoreEntryHandler>(RetrieveEncryptedStoreEntryHandler);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    encryptedStoreService = module.get(EncryptedStoreService);
  });

  describe('execute', () => {
    it('should call encryptedStoreService.retrieve with query parameters', async () => {
      // Arrange
      const query = new RetrieveEncryptedStoreEntryQuery({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email'
      });

      // Act
      await handler.execute(query);

      // Assert
      expect(encryptedStoreService.retrieve).toHaveBeenCalledWith({
        tenantId: 123,
        requestedBy: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        requestId: undefined,
        correlationId: undefined,
        causationId: undefined,
        emitAuditEvent: true
      });
    });

    it('should return decrypted data', async () => {
      // Arrange
      encryptedStoreService.retrieve.mockResolvedValue('sensitive-data@example.com');
      const query = new RetrieveEncryptedStoreEntryQuery({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email'
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toBe('sensitive-data@example.com');
    });

    it('should propagate service errors', async () => {
      // Arrange
      encryptedStoreService.retrieve.mockRejectedValue(new Error('encrypted-store entry not found'));
      const query = new RetrieveEncryptedStoreEntryQuery({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email'
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('encrypted-store entry not found');
    });

    it('should forward request trace metadata', async () => {
      const query = new RetrieveEncryptedStoreEntryQuery({
        tenantId: 123,
        actorId: 7,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        requestId: 'req-read',
        correlationId: 'corr-read',
        causationId: 'cause-read'
      });

      await handler.execute(query);

      expect(encryptedStoreService.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-read',
          correlationId: 'corr-read',
          causationId: 'cause-read'
        })
      );
    });
  });
});
