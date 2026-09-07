import { Logger } from '@nestjs/common';

import {
  AddressKeyRotationJob,
  ADDRESS_KEY_ROTATION_QUEUE,
  RotationTriggerSource
} from '../address-key-rotation.job';

import type { RotationProgress } from '../../services/address-key-rotation.service';
import type { AddressKeyRotationJobPayload } from '../address-key-rotation.job';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Helpers / Mocks
// ---------------------------------------------------------------------------

/** Minimal BullMQ Job mock */
function makeMockJob(
  data: AddressKeyRotationJobPayload,
  id = 'job-001',
  attemptsMade = 0
): jest.Mocked<
  Pick<Job<AddressKeyRotationJobPayload>, 'id' | 'data' | 'attemptsMade' | 'updateProgress'>
> {
  return {
    id,
    data,
    attemptsMade,
    updateProgress: jest.fn().mockResolvedValue(undefined)
  };
}

const DEFAULT_PAYLOAD: AddressKeyRotationJobPayload = {
  organizationId: 42,
  oldKeyId: 'old-key-v1',
  newKeyId: 'new-key-v2',
  actorId: 7,
  triggerSource: RotationTriggerSource.Manual,
  requestId: 'req-001',
  correlationId: 'corr-001',
  causationId: 'cause-001'
};

const SUCCESS_RESULT: RotationProgress = {
  processedCount: 100,
  failedCount: 0,
  totalCount: 100,
  isComplete: true,
  errors: []
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AddressKeyRotationJob', () => {
  let job: AddressKeyRotationJob;
  let rotationServiceMock: { rotateVaultEntries: jest.Mock };

  beforeEach(() => {
    rotationServiceMock = {
      rotateVaultEntries: jest.fn().mockResolvedValue(SUCCESS_RESULT)
    };

    // Override logger to suppress output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    job = new AddressKeyRotationJob(rotationServiceMock as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Module constants
  // -------------------------------------------------------------------------

  describe('ADDRESS_KEY_ROTATION_QUEUE constant', () => {
    it('should equal the expected queue name', () => {
      expect(ADDRESS_KEY_ROTATION_QUEUE).toBe('address-key-rotation');
    });
  });

  // -------------------------------------------------------------------------
  // process() — success path
  // -------------------------------------------------------------------------

  describe('process() — success path', () => {
    it('should call rotateVaultEntries with tenant-scoped params', async () => {
      const mockJob = makeMockJob(DEFAULT_PAYLOAD);

      await job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>);

      expect(rotationServiceMock.rotateVaultEntries).toHaveBeenCalledTimes(1);
      expect(rotationServiceMock.rotateVaultEntries).toHaveBeenCalledWith({
        organizationId: DEFAULT_PAYLOAD.organizationId,
        oldKeyId: DEFAULT_PAYLOAD.oldKeyId,
        newKeyId: DEFAULT_PAYLOAD.newKeyId,
        actorId: DEFAULT_PAYLOAD.actorId,
        requestId: DEFAULT_PAYLOAD.requestId,
        correlationId: DEFAULT_PAYLOAD.correlationId,
        causationId: DEFAULT_PAYLOAD.causationId
      });
    });

    it('should report progress 0 then 100 on success', async () => {
      const mockJob = makeMockJob(DEFAULT_PAYLOAD);

      await job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>);

      expect(mockJob.updateProgress).toHaveBeenCalledWith(0);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
      expect(mockJob.updateProgress).toHaveBeenCalledTimes(2);
    });

    it('should handle system actor (no actorId)', async () => {
      const payload: AddressKeyRotationJobPayload = { ...DEFAULT_PAYLOAD, actorId: undefined };
      const mockJob = makeMockJob(payload);

      await job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>);

      expect(rotationServiceMock.rotateVaultEntries).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: undefined })
      );
    });

    it('should handle pubsub trigger source', async () => {
      const payload: AddressKeyRotationJobPayload = {
        ...DEFAULT_PAYLOAD,
        triggerSource: RotationTriggerSource.PubSub
      };
      const mockJob = makeMockJob(payload);

      await job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>);

      expect(rotationServiceMock.rotateVaultEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: payload.organizationId,
          oldKeyId: payload.oldKeyId,
          newKeyId: payload.newKeyId
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // process() — partial failure path
  // -------------------------------------------------------------------------

  describe('process() — partial failure path', () => {
    it('should complete (not throw) when failedCount > 0', async () => {
      rotationServiceMock.rotateVaultEntries.mockResolvedValue({
        ...SUCCESS_RESULT,
        processedCount: 95,
        failedCount: 5,
        isComplete: true,
        errors: [
          {
            entryId: 1,
            entityType: 'user_address',
            entityId: '10',
            fieldPath: 'components.street',
            error: 'Decryption failed'
          }
        ]
      });

      const mockJob = makeMockJob(DEFAULT_PAYLOAD);

      // Should NOT throw — partial failures are handled gracefully
      await expect(
        job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>)
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // process() — error / retry path
  // -------------------------------------------------------------------------

  describe('process() — error / retry path', () => {
    it('should re-throw errors for BullMQ retry handling', async () => {
      const serviceError = new Error('KMS key not found');
      rotationServiceMock.rotateVaultEntries.mockRejectedValue(serviceError);

      const mockJob = makeMockJob(DEFAULT_PAYLOAD);

      await expect(
        job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>)
      ).rejects.toThrow('KMS key not found');
    });

    it('should still report initial progress (0) before the error', async () => {
      rotationServiceMock.rotateVaultEntries.mockRejectedValue(new Error('Service unavailable'));

      const mockJob = makeMockJob(DEFAULT_PAYLOAD);

      await expect(
        job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>)
      ).rejects.toThrow();

      // Progress 0 must be reported before the service call
      expect(mockJob.updateProgress).toHaveBeenCalledWith(0);
      // Progress 100 must NOT be reported on failure
      expect(mockJob.updateProgress).not.toHaveBeenCalledWith(100);
    });
  });

  // -------------------------------------------------------------------------
  // P0: Tenant isolation
  // -------------------------------------------------------------------------

  describe('P0 — tenant isolation', () => {
    it('should only pass organizationId from job payload to the service', async () => {
      const tenantA: AddressKeyRotationJobPayload = {
        organizationId: 1,
        oldKeyId: 'key-a-old',
        newKeyId: 'key-a-new',
        triggerSource: RotationTriggerSource.Manual
      };

      const mockJob = makeMockJob(tenantA);
      await job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>);

      const call = rotationServiceMock.rotateVaultEntries.mock.calls[0][0] as {
        organizationId: number;
      };

      // Verify that the service is called with the exact tenant from the payload
      expect(call.organizationId).toBe(1);
    });

    it('should call service once per job (no cross-tenant leakage)', async () => {
      const mockJob = makeMockJob(DEFAULT_PAYLOAD);
      await job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>);

      // Service MUST be called exactly once — no cross-tenant fan-out
      expect(rotationServiceMock.rotateVaultEntries).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // P0: No PII in logs
  // -------------------------------------------------------------------------

  describe('P0 — no PII in log output', () => {
    it('should not log encrypted values or plaintext PII', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const mockJob = makeMockJob({
        ...DEFAULT_PAYLOAD,
        // Verify these never appear in logs
        correlationId: 'safe-correlation-id'
      });
      await job.process(mockJob as unknown as Job<AddressKeyRotationJobPayload>);

      // All logged objects should be inspectable and contain only IDs/counts
      for (const call of [...logSpy.mock.calls, ...warnSpy.mock.calls]) {
        const loggedObject = call[0] as Record<string, unknown>;
        // Should never log 'encryptedValue', 'plaintext', 'dek', 'kek', 'keyMaterial'
        expect(loggedObject).not.toHaveProperty('encryptedValue');
        expect(loggedObject).not.toHaveProperty('plaintext');
        expect(loggedObject).not.toHaveProperty('dek');
        expect(loggedObject).not.toHaveProperty('kek');
        expect(loggedObject).not.toHaveProperty('keyMaterial');
      }
    });
  });
});
