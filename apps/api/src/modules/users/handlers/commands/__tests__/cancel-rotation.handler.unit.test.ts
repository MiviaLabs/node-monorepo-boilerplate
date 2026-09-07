import { Test } from '@nestjs/testing';

import { CancelRotationCommand } from '../../../commands/cancel-rotation.command';
import { AddressKeyRotationService } from '../../../services/address-key-rotation.service';
import { CancelRotationHandler } from '../cancel-rotation.handler';

import type { TestingModule } from '@nestjs/testing';

describe('CancelRotationHandler', () => {
  let handler: CancelRotationHandler;
  let service: jest.Mocked<AddressKeyRotationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelRotationHandler,
        {
          provide: AddressKeyRotationService,
          useValue: { cancelRotation: jest.fn() }
        }
      ]
    }).compile();

    handler = module.get<CancelRotationHandler>(CancelRotationHandler);
    service = module.get(AddressKeyRotationService);
  });

  it('should successfully cancel rotation', async () => {
    service.cancelRotation.mockResolvedValue(undefined);

    const command = new CancelRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(true);
    expect(service.cancelRotation).toHaveBeenCalledWith(1, 42, 100, {
      requestId: undefined,
      correlationId: undefined,
      causationId: undefined
    });
  });

  it('should return commandFailure when rotation not found', async () => {
    const notFoundError = new Error('Rotation state not found');
    notFoundError.name = 'NotFoundError';
    service.cancelRotation.mockRejectedValue(notFoundError);

    const command = new CancelRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 999
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('should return commandFailure when rotation cannot be cancelled', async () => {
    const invalidStateError = new Error('Rotation is already completed');
    invalidStateError.name = 'InvalidStateError';
    service.cancelRotation.mockRejectedValue(invalidStateError);

    const command = new CancelRotationCommand({
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
    service.cancelRotation.mockResolvedValue(undefined);

    const command = new CancelRotationCommand({
      tenantId: 999,
      actorId: 100,
      rotationStateId: 42
    });

    await handler.execute(command);

    expect(service.cancelRotation).toHaveBeenCalledWith(999, 42, 100, {
      requestId: undefined,
      correlationId: undefined,
      causationId: undefined
    });
  });

  it('should propagate trace metadata to the rotation service', async () => {
    service.cancelRotation.mockResolvedValue(undefined);

    const command = new CancelRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42,
      requestId: 'req-123',
      correlationId: 'corr-123',
      causationId: 'cause-123'
    });

    await handler.execute(command);

    expect(service.cancelRotation).toHaveBeenCalledWith(1, 42, 100, {
      requestId: 'req-123',
      correlationId: 'corr-123',
      causationId: 'cause-123'
    });
  });

  it('should not expose sensitive details in errors', async () => {
    service.cancelRotation.mockRejectedValue(new Error('Failed: sensitive-key-material-details'));

    const result = await handler.execute(
      new CancelRotationCommand({
        tenantId: 1,
        actorId: 100,
        rotationStateId: 42
      })
    );

    // Error message should be generic, not contain sensitive data
    const errorMessage = result.errors?.[0] ?? '';
    expect(errorMessage).not.toContain('sensitive-key-material-details');
  });

  it('should handle service errors gracefully', async () => {
    service.cancelRotation.mockRejectedValue(new Error('Database connection failed'));

    const command = new CancelRotationCommand({
      tenantId: 1,
      actorId: 100,
      rotationStateId: 42
    });

    const result = await handler.execute(command);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
