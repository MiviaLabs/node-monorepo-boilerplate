import { Test } from '@nestjs/testing';

import { RotateAddressKeyCommand } from '../../../commands/rotate-address-key.command';
import { AddressKeyRotationService } from '../../../services/address-key-rotation.service';
import { RotateAddressKeyHandler } from '../rotate-address-key.handler';

import type { TestingModule } from '@nestjs/testing';

describe('RotateAddressKeyHandler', () => {
  let handler: RotateAddressKeyHandler;
  let service: jest.Mocked<AddressKeyRotationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RotateAddressKeyHandler,
        {
          provide: AddressKeyRotationService,
          useValue: { rotateVaultEntries: jest.fn() }
        }
      ]
    }).compile();

    handler = module.get<RotateAddressKeyHandler>(RotateAddressKeyHandler);
    service = module.get(AddressKeyRotationService);
  });

  it('should successfully rotate encrypted-store entries', async () => {
    service.rotateVaultEntries.mockResolvedValue({
      rotationStateId: 42,
      processedCount: 50,
      failedCount: 0,
      totalCount: 50,
      isComplete: true,
      errors: []
    });

    const command = new RotateAddressKeyCommand({
      tenantId: 1,
      actorId: 100,
      oldKeyId: 'key-1',
      newKeyId: 'key-2'
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(true);
    expect(result.data?.processedCount).toBe(50);
  });

  it('should return real rotationStateId from service result (not hardcoded null)', async () => {
    service.rotateVaultEntries.mockResolvedValue({
      rotationStateId: 99,
      processedCount: 10,
      failedCount: 0,
      totalCount: 10,
      isComplete: true,
      errors: []
    });

    const result = await handler.execute(
      new RotateAddressKeyCommand({ tenantId: 1, actorId: 1, oldKeyId: 'k1', newKeyId: 'k2' })
    );

    expect(result.success).toBe(true);
    expect(result.data?.rotationStateId).toBe(99);
  });

  it('should return commandFailure on failure', async () => {
    service.rotateVaultEntries.mockRejectedValue(new Error('KMS unavailable'));

    const command = new RotateAddressKeyCommand({
      tenantId: 1,
      actorId: 100,
      oldKeyId: 'key-1',
      newKeyId: 'key-2'
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('should not expose sensitive details in errors', async () => {
    service.rotateVaultEntries.mockRejectedValue(new Error('Failed: xxxxx-secret-key-material'));

    const result = await handler.execute(
      new RotateAddressKeyCommand({
        tenantId: 1,
        actorId: 100,
        oldKeyId: 'key-1',
        newKeyId: 'key-2'
      })
    );

    // Error message should be generic, not contain sensitive data
    const errorMessage = result.errors?.[0] ?? '';
    expect(errorMessage).not.toContain('xxxxx-secret-key-material');
  });

  it('should pass tenantId for multi-tenancy', async () => {
    service.rotateVaultEntries.mockResolvedValue({
      rotationStateId: 1,
      processedCount: 1,
      failedCount: 0,
      totalCount: 1,
      isComplete: true,
      errors: []
    });

    const command = new RotateAddressKeyCommand({
      tenantId: 999,
      actorId: 100,
      oldKeyId: 'key-1',
      newKeyId: 'key-2'
    });

    await handler.execute(command);

    expect(service.rotateVaultEntries).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 999 })
    );
  });

  it('should propagate trace metadata to the rotation service', async () => {
    service.rotateVaultEntries.mockResolvedValue({
      rotationStateId: 1,
      processedCount: 1,
      failedCount: 0,
      totalCount: 1,
      isComplete: true,
      errors: []
    });

    const command = new RotateAddressKeyCommand({
      tenantId: 1,
      actorId: 100,
      oldKeyId: 'key-1',
      newKeyId: 'key-2',
      requestId: 'req-123',
      correlationId: 'corr-123',
      causationId: 'cause-123'
    });

    await handler.execute(command);

    expect(service.rotateVaultEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-123',
        correlationId: 'corr-123',
        causationId: 'cause-123'
      })
    );
  });

  it('should include errors from rotation in result', async () => {
    service.rotateVaultEntries.mockResolvedValue({
      rotationStateId: 5,
      processedCount: 48,
      failedCount: 2,
      totalCount: 50,
      isComplete: true,
      errors: [
        {
          entryId: 1,
          entityType: 'user_address',
          entityId: 'addr-1',
          fieldPath: 'street',
          error: 'Decryption failed'
        },
        {
          entryId: 2,
          entityType: 'user_address',
          entityId: 'addr-2',
          fieldPath: 'city',
          error: 'Encryption failed'
        }
      ]
    });

    const command = new RotateAddressKeyCommand({
      tenantId: 1,
      actorId: 100,
      oldKeyId: 'key-1',
      newKeyId: 'key-2'
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(true);
    expect(result.data?.failedCount).toBe(2);
  });
});
