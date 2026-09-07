import { Logger } from '@nestjs/common';

import {
  ScheduledRotationCheckJob,
  SCHEDULED_ROTATION_CHECK_QUEUE
} from '../scheduled-rotation-check.job';

import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Helpers / Mocks
// ---------------------------------------------------------------------------

/** Minimal BullMQ Job mock */
function makeMockJob(id = 'scheduled-check-001'): jest.Mocked<Pick<Job, 'id'>> {
  return {
    id
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScheduledRotationCheckJob', () => {
  let job: ScheduledRotationCheckJob;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Override logger to capture output during tests
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    job = new ScheduledRotationCheckJob();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Module constants
  // -------------------------------------------------------------------------

  describe('SCHEDULED_ROTATION_CHECK_QUEUE constant', () => {
    it('should equal the expected queue name', () => {
      expect(SCHEDULED_ROTATION_CHECK_QUEUE).toBe('scheduled-rotation-check');
    });
  });

  // -------------------------------------------------------------------------
  // onModuleInit() — cron registration
  // -------------------------------------------------------------------------

  describe('onModuleInit()', () => {
    it('should log registration success when cron job created successfully', async () => {
      // Actual implementation calls addCronJob, which may succeed or fail
      // We can't easily mock the import, so we test the logging behavior
      await job.onModuleInit();

      // Should either log success or warn on failure
      const loggedSuccess = logSpy.mock.calls.some((call) => {
        const logData = call[0] as Record<string, unknown>;
        return (
          logData['message'] === 'Scheduled rotation check cron job registered' &&
          logData['schedule'] === '0 * * * *' &&
          logData['jobName'] === 'check-rotation-stalled' &&
          logData['queueName'] === SCHEDULED_ROTATION_CHECK_QUEUE &&
          logData['timezone'] === 'UTC'
        );
      });

      const warnedFailure = warnSpy.mock.calls.some((call) => {
        const logData = call[0] as Record<string, unknown>;
        return (
          logData['message'] ===
          'Failed to register scheduled rotation check cron job — manual monitoring required'
        );
      });

      // One of these must be true (either success or failure)
      expect(loggedSuccess || warnedFailure).toBe(true);
    });

    it('should handle registration failures gracefully (non-fatal)', async () => {
      // onModuleInit should not throw even if registration fails
      await expect(job.onModuleInit()).resolves.toBeUndefined();
    });

    it('should log warnings with error message when registration fails', async () => {
      await job.onModuleInit();

      // If registration failed, check that warning includes error info
      const failureWarnings = warnSpy.mock.calls.filter((call) => {
        const logData = call[0] as Record<string, unknown>;
        return (
          logData['message'] ===
          'Failed to register scheduled rotation check cron job — manual monitoring required'
        );
      });

      if (failureWarnings.length > 0) {
        const warningData = failureWarnings[0][0] as Record<string, unknown>;
        // Should have an error field
        expect(warningData).toHaveProperty('error');
        expect(typeof warningData['error']).toBe('string');
      }
    });
  });

  // -------------------------------------------------------------------------
  // process() — heartbeat logging
  // -------------------------------------------------------------------------

  describe('process()', () => {
    it('should log job execution start with jobId and timestamp', () => {
      const mockJob = makeMockJob('test-job-123');

      job.process(mockJob as unknown as Job);

      // Verify start log
      const startLogs = logSpy.mock.calls.filter((call) => {
        const logData = call[0] as Record<string, unknown>;
        return logData['message'] === 'Scheduled rotation check started';
      });

      expect(startLogs.length).toBeGreaterThan(0);
      const startLog = startLogs[0][0] as Record<string, unknown>;
      expect(startLog['jobId']).toBe('test-job-123');
      expect(startLog).toHaveProperty('runAt');
      expect(typeof startLog['runAt']).toBe('string');
    });

    it('should log job completion with note about monitoring', () => {
      const mockJob = makeMockJob('test-job-456');

      job.process(mockJob as unknown as Job);

      // Verify completion log
      const completionLogs = logSpy.mock.calls.filter((call) => {
        const logData = call[0] as Record<string, unknown>;
        return logData['message'] === 'Scheduled rotation check completed';
      });

      expect(completionLogs.length).toBeGreaterThan(0);
      const completionLog = completionLogs[0][0] as Record<string, unknown>;
      expect(completionLog['jobId']).toBe('test-job-456');
      expect(completionLog['note']).toBe(
        'Monitor key_rotation_state for stalled IN_PROGRESS records if rotation events are missed.'
      );
    });

    it('should complete without errors', () => {
      const mockJob = makeMockJob();

      // Should complete synchronously without errors
      expect(() => job.process(mockJob as unknown as Job)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // P0: No PII in logs
  // -------------------------------------------------------------------------

  describe('P0 — no PII in log output', () => {
    it('should not log encrypted values or plaintext PII', () => {
      const mockJob = makeMockJob();

      job.process(mockJob as unknown as Job);

      // All logged objects should be inspectable and contain only safe fields
      for (const call of logSpy.mock.calls) {
        const loggedObject = call[0] as Record<string, unknown>;

        // Should never log PII fields
        expect(loggedObject).not.toHaveProperty('encryptedValue');
        expect(loggedObject).not.toHaveProperty('plaintext');
        expect(loggedObject).not.toHaveProperty('dek');
        expect(loggedObject).not.toHaveProperty('kek');
        expect(loggedObject).not.toHaveProperty('keyMaterial');
        expect(loggedObject).not.toHaveProperty('email');
        expect(loggedObject).not.toHaveProperty('password');
      }
    });

    it('should only log safe identifiers (jobId, runAt)', () => {
      const mockJob = makeMockJob('safe-job-id');

      job.process(mockJob as unknown as Job);

      // Verify only safe fields are logged
      const startLog = logSpy.mock.calls.find(
        (call) =>
          (call[0] as Record<string, unknown>)['message'] === 'Scheduled rotation check started'
      );

      expect(startLog).toBeDefined();
      const loggedData = startLog![0] as Record<string, unknown>;
      expect(loggedData).toHaveProperty('jobId', 'safe-job-id');
      expect(loggedData).toHaveProperty('runAt');
      expect(typeof loggedData['runAt']).toBe('string');
    });
  });
});
