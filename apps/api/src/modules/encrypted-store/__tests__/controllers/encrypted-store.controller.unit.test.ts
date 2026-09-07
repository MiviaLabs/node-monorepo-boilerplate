/**
 * SecureVaultController Unit Tests
 *
 * Tests controller endpoints with mocked CommandBus and QueryBus.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - POST /vault/store - store encrypted PII (via CreateEncryptedStoreEntryCommand)
 * - GET /vault/retrieve/:entityType/:entityId/:fieldPath - retrieve decrypted PII (via RetrieveEncryptedStoreEntryQuery)
 * - POST /vault/rotate-key - initiate key rotation (via RotateEncryptedStoreKeyCommand)
 * - Tenant ID extraction and conversion
 * - Error handling with ICommandResult pattern
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { commandSuccess } from '@package/types';

import { CreateEncryptedStoreEntryCommand, RotateEncryptedStoreKeyCommand } from '../../commands';
import { StoreDataDto, RotateKeyDto } from '../../dtos/encrypted-store.dto';
import { RetrieveEncryptedStoreEntryQuery } from '../../queries';
import { SecureVaultController } from '../../encrypted-store.controller';

import type { CreateEncryptedStoreEntryResult, RotateEncryptedStoreKeyResult } from '../../commands';
import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { TestingModule } from '@nestjs/testing';
import type { DataClassification, ICommandResult } from '@package/types';

import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

describe('SecureVaultController', () => {
  let controller: SecureVaultController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  // Test data
  const tenantId = '123';
  const actorId = '7';
  const trace: RequestTrace = {
    requestId: 'req-vault-1',
    correlationId: 'corr-vault-1',
    causationId: 'cause-vault-1'
  };

  beforeEach(async () => {
    // Create mock command and query buses
    const mockCommandBus = {
      execute: jest.fn()
    };
    const mockQueryBus = {
      execute: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecureVaultController],
      providers: [
        {
          provide: CommandBus,
          useValue: mockCommandBus
        },
        {
          provide: QueryBus,
          useValue: mockQueryBus
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SecureVaultController>(SecureVaultController);
    commandBus = module.get(CommandBus) as jest.Mocked<CommandBus>;
    queryBus = module.get(QueryBus) as jest.Mocked<QueryBus>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('store', () => {
    it('should store data and return success response', async () => {
      // Arrange
      const dto = new StoreDataDto();
      dto.entityType = 'user';
      dto.entityId = 789;
      dto.fieldPath = 'email';
      dto.data = 'test@example.com';
      dto.classification = 'confidential' as DataClassification;

      commandBus.execute.mockResolvedValue(
        commandSuccess({ vaultEntryId: 1 } as CreateEncryptedStoreEntryResult)
      );

      // Act
      const result = await controller.store(tenantId, actorId, trace, dto);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual({ message: 'Data stored successfully in vault' });
    });

    it('should dispatch CreateEncryptedStoreEntryCommand with correct parameters', async () => {
      // Arrange
      const dto = new StoreDataDto();
      dto.entityType = 'organization';
      dto.entityId = 456;
      dto.fieldPath = 'tax_id';
      dto.data = '12-3456789';
      dto.classification = 'restricted' as DataClassification;

      commandBus.execute.mockResolvedValue(
        commandSuccess({ vaultEntryId: 1 } as CreateEncryptedStoreEntryResult)
      );

      // Act
      await controller.store(tenantId, actorId, trace, dto);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateEncryptedStoreEntryCommand));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const command = commandBus.execute.mock.calls[0]![0] as CreateEncryptedStoreEntryCommand;
      expect(command.tenantId).toBe(123);
      expect(command.actorId).toBe(7);
      expect(command.entityType).toBe('organization');
      expect(command.entityId).toBe(456);
      expect(command.fieldPath).toBe('tax_id');
      expect(command.value).toBe('12-3456789');
      expect(command.classification).toBe('restricted');
      expect(command.requestId).toBe(trace.requestId);
      expect(command.correlationId).toBe(trace.correlationId);
      expect(command.causationId).toBe(trace.causationId);
    });

    it('should throw InternalServerErrorException when command fails', async () => {
      // Arrange
      const dto = new StoreDataDto();
      dto.entityType = 'user';
      dto.entityId = 789;
      dto.fieldPath = 'email';
      dto.data = 'test@example.com';

      commandBus.execute.mockResolvedValue({
        success: false,
        errors: ['Encryption failed']
      } as ICommandResult<CreateEncryptedStoreEntryResult>);

      // Act & Assert
      await expect(controller.store(tenantId, actorId, trace, dto)).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should propagate command errors in exception message', async () => {
      // Arrange
      const dto = new StoreDataDto();
      dto.entityType = 'user';
      dto.entityId = 789;
      dto.fieldPath = 'email';
      dto.data = 'test@example.com';

      commandBus.execute.mockResolvedValue({
        success: false,
        errors: ['Database error', 'Encryption failed']
      } as ICommandResult<CreateEncryptedStoreEntryResult>);

      // Act & Assert
      await expect(controller.store(tenantId, actorId, trace, dto)).rejects.toThrow(
        'Database error, Encryption failed'
      );
    });
  });

  describe('retrieve', () => {
    it('should retrieve data and return in response', async () => {
      // Arrange
      const entityType = 'user';
      const entityId = '789';
      const fieldPath = 'email';

      queryBus.execute.mockResolvedValue('decrypted-email@example.com');

      // Act
      const result = await controller.retrieve(
        tenantId,
        actorId,
        trace,
        entityType,
        entityId,
        fieldPath
      );

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual({ data: 'decrypted-email@example.com' });
    });

    it('should dispatch RetrieveEncryptedStoreEntryQuery with correct parameters', async () => {
      // Arrange
      const entityType = 'organization';
      const entityId = '456';
      const fieldPath = 'tax_id';

      queryBus.execute.mockResolvedValue('decrypted-tax-id');

      // Act
      await controller.retrieve(tenantId, actorId, trace, entityType, entityId, fieldPath);

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(expect.any(RetrieveEncryptedStoreEntryQuery));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const query = queryBus.execute.mock.calls[0]![0] as RetrieveEncryptedStoreEntryQuery;
      expect(query.tenantId).toBe(123);
      expect(query.actorId).toBe(7);
      expect(query.entityType).toBe('organization');
      expect(query.entityId).toBe(456);
      expect(query.fieldPath).toBe('tax_id');
      expect(query.requestId).toBe(trace.requestId);
      expect(query.correlationId).toBe(trace.correlationId);
      expect(query.causationId).toBe(trace.causationId);
    });

    it('should propagate query errors', async () => {
      // Arrange
      queryBus.execute.mockRejectedValue(new Error('Vault entry not found'));

      // Act & Assert
      await expect(
        controller.retrieve(tenantId, actorId, trace, 'user', '789', 'email')
      ).rejects.toThrow('Vault entry not found');
    });
  });

  describe('rotateKey', () => {
    it('should initiate key rotation and return success response', async () => {
      // Arrange
      const dto = new RotateKeyDto();
      dto.oldKeyId = 'tenant-123-v1';
      dto.newKeyId = 'tenant-123-v2';

      commandBus.execute.mockResolvedValue(
        commandSuccess({ rotatedEntries: 10 } as RotateEncryptedStoreKeyResult)
      );

      // Act
      const result = await controller.rotateKey(tenantId, actorId, trace, dto);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual({ message: 'Key rotation initiated successfully' });
    });

    it('should dispatch RotateEncryptedStoreKeyCommand with correct parameters', async () => {
      // Arrange
      const dto = new RotateKeyDto();
      dto.oldKeyId = 'tenant-123-v1';
      dto.newKeyId = 'tenant-123-v2';

      commandBus.execute.mockResolvedValue(
        commandSuccess({ rotatedEntries: 10 } as RotateEncryptedStoreKeyResult)
      );

      // Act
      await controller.rotateKey(tenantId, actorId, trace, dto);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(RotateEncryptedStoreKeyCommand));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const command = commandBus.execute.mock.calls[0]![0] as RotateEncryptedStoreKeyCommand;
      expect(command.tenantId).toBe(123);
      expect(command.actorId).toBe(7);
      expect(command.oldKeyId).toBe('tenant-123-v1');
      expect(command.newKeyId).toBe('tenant-123-v2');
      expect(command.requestId).toBe(trace.requestId);
      expect(command.correlationId).toBe(trace.correlationId);
      expect(command.causationId).toBe(trace.causationId);
    });

    it('should throw InternalServerErrorException when command fails', async () => {
      // Arrange
      const dto = new RotateKeyDto();
      dto.oldKeyId = 'tenant-123-v1';
      dto.newKeyId = 'tenant-123-v2';

      commandBus.execute.mockResolvedValue({
        success: false,
        errors: ['Key rotation failed']
      } as ICommandResult<RotateEncryptedStoreKeyResult>);

      // Act & Assert
      await expect(controller.rotateKey(tenantId, actorId, trace, dto)).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should reject rotate key when old and new key IDs are equal', async () => {
      const dto = new RotateKeyDto();
      dto.oldKeyId = 'tenant-123-v1';
      dto.newKeyId = 'tenant-123-v1';

      await expect(controller.rotateKey(tenantId, actorId, trace, dto)).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.rotateKey(tenantId, actorId, trace, dto)).rejects.toThrow(
        'oldKeyId and newKeyId must be different'
      );
    });
  });

  describe('tenant ID handling', () => {
    it('should handle numeric string tenant IDs', async () => {
      // Arrange
      const dto = new StoreDataDto();
      dto.entityType = 'user';
      dto.entityId = 789;
      dto.fieldPath = 'email';
      dto.data = 'test@example.com';

      commandBus.execute.mockResolvedValue(
        commandSuccess({ vaultEntryId: 1 } as CreateEncryptedStoreEntryResult)
      );

      // Act
      await controller.store('999', actorId, trace, dto);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const command = commandBus.execute.mock.calls[0]![0] as CreateEncryptedStoreEntryCommand;
      expect(command.tenantId).toBe(999);
    });

    it('should handle large tenant IDs', async () => {
      // Arrange
      const dto = new StoreDataDto();
      dto.entityType = 'user';
      dto.entityId = 789;
      dto.fieldPath = 'email';
      dto.data = 'test@example.com';

      commandBus.execute.mockResolvedValue(
        commandSuccess({ vaultEntryId: 1 } as CreateEncryptedStoreEntryResult)
      );

      // Act
      await controller.store('999999999', actorId, trace, dto);

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const command = commandBus.execute.mock.calls[0]![0] as CreateEncryptedStoreEntryCommand;
      expect(command.tenantId).toBe(999999999);
    });
  });
});
