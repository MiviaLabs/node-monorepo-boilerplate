import { PurgeDeletedFilesHandler } from '../purge-deleted-files.handler';

describe('PurgeDeletedFilesHandler', () => {
  it('returns maintenance counts from the storage service when the lock is acquired', async () => {
    const storageFilesService = {
      purgeDeletedFiles: jest.fn().mockResolvedValue({
        purgedCount: 2,
        candidates: 2,
        errors: []
      }),
      reconcileStalePendingUploads: jest.fn().mockResolvedValue({
        candidates: 3,
        recoveredCount: 1,
        failedCount: 1,
        errors: []
      })
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const databaseConnection = {
      pool: {
        connect: jest.fn().mockResolvedValue({
          query,
          release
        })
      }
    };

    const handler = new PurgeDeletedFilesHandler(
      storageFilesService as never,
      databaseConnection as never
    );

    const result = await handler.handle({
      data: {
        retentionHours: 24,
        stalePendingUploadHours: 24,
        dryRun: false,
        batchSize: 100
      }
    });

    expect(storageFilesService.purgeDeletedFiles).toHaveBeenCalled();
    expect(storageFilesService.reconcileStalePendingUploads).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      dryRun: false,
      purgedCount: 2,
      failedPendingUploadCount: 1,
      recoveredPendingUploadCount: 1,
      errors: []
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      'select pg_try_advisory_lock($1) as acquired',
      [8643305]
    );
    expect(query).toHaveBeenNthCalledWith(2, 'select pg_advisory_unlock($1)', [8643305]);
    expect(release).toHaveBeenCalled();
  });
});
