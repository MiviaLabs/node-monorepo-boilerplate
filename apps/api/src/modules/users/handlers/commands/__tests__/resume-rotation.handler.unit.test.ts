import { Test } from '@nestjs/testing';

import { ResumeRotationCommand } from '../../../commands/resume-rotation.command';
import { AddressKeyRotationService } from '../../../services/address-key-rotation.service';
import { ResumeRotationHandler } from '../resume-rotation.handler';

import type { TestingModule } from '@nestjs/testing';

describe('ResumeRotationHandler', () => {
  let handler: ResumeRotationHandler;
  let service: jest.Mocked<AddressKeyRotationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumeRotationHandler,
        {
          provide: AddressKeyRotationService,
          useValue: { resumeRotation: jest.fn() }
        }
      ]
    }).compile();

    handler = module.get<ResumeRotationHandler>(ResumeRotationHandler);
    service = module.get(AddressKeyRotationService);
  });

  it('should successfully resume rotation', async () => {
    service.resumeRotation.mockResolvedValue({
      processedCount: 75,
      failedCount: 0,
      totalCount: 100,
      isComplete: false,
      errors: []
    });

    const command = new ResumeRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(true);
    expect(result.data?.processedCount).toBe(75);
    expect(result.data?.rotationStateId).toBe(42);
  });

  it('should return commandFailure when rotation state not found', async () => {
    const notFoundError = new Error('Rotation state not found');
    notFoundError.name = 'NotFoundError';
    service.resumeRotation.mockRejectedValue(notFoundError);

    const command = new ResumeRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 999
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('should return commandFailure when rotation cannot be resumed', async () => {
    const invalidStateError = new Error('Rotation is already completed');
    invalidStateError.name = 'InvalidStateError';
    service.resumeRotation.mockRejectedValue(invalidStateError);

    const command = new ResumeRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('should pass tenantId for multi-tenancy', async () => {
    service.resumeRotation.mockResolvedValue({
      processedCount: 10,
      failedCount: 0,
      totalCount: 100,
      isComplete: false,
      errors: []
    });

    const command = new ResumeRotationCommand({
      tenantId: 999,
      actorId: 100,
      rotationStateId: 42
    });

    await handler.execute(command);

    expect(service.resumeRotation).toHaveBeenCalledWith(999, 42, 100, {
      requestId: undefined,
      correlationId: undefined,
      causationId: undefined
    });
  });

  it('should propagate trace metadata to the rotation service', async () => {
    service.resumeRotation.mockResolvedValue({
      processedCount: 10,
      failedCount: 0,
      totalCount: 100,
      isComplete: false,
      errors: []
    });

    const command = new ResumeRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42,
      requestId: 'req-123',
      correlationId: 'corr-123',
      causationId: 'cause-123'
    });

    await handler.execute(command);

    expect(service.resumeRotation).toHaveBeenCalledWith(1, 42, 100, {
      requestId: 'req-123',
      correlationId: 'corr-123',
      causationId: 'cause-123'
    });
  });

  it('should not expose sensitive details in errors', async () => {
    service.resumeRotation.mockRejectedValue(
      new Error('Failed: xxxxx-sensitive-key-rotation-data')
    );

    const result = await handler.execute(
      new ResumeRotationCommand({
        tenantId: 1,
        actorId: 100,
        rotationStateId: 42
      })
    );

    // Error message should be generic, not contain sensitive data
    const errorMessage = result.errors?.[0] ?? '';
    expect(errorMessage).not.toContain('xxxxx-sensitive-key-rotation-data');
  });

  it('should include rotation progress when completed', async () => {
    service.resumeRotation.mockResolvedValue({
      processedCount: 100,
      failedCount: 0,
      totalCount: 100,
      isComplete: true,
      errors: []
    });

    const command = new ResumeRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(true);
    expect(result.data?.isComplete).toBe(true);
    expect(result.data?.processedCount).toBe(100);
  });

  it('should include errors from failed rotation attempts', async () => {
    service.resumeRotation.mockResolvedValue({
      processedCount: 95,
      failedCount: 5,
      totalCount: 100,
      isComplete: true,
      errors: [
        {
          entryId: 101,
          entityType: 'user_address',
          entityId: 'addr-101',
          fieldPath: 'street',
          error: 'Decryption failed'
        },
        {
          entryId: 102,
          entityType: 'user_address',
          entityId: 'addr-102',
          fieldPath: 'city',
          error: 'Encryption failed'
        }
      ]
    });

    const command = new ResumeRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(true);
    expect(result.data?.failedCount).toBe(5);
  });

  it('should handle service errors gracefully', async () => {
    service.resumeRotation.mockRejectedValue(new Error('Database connection failed'));

    const command = new ResumeRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
