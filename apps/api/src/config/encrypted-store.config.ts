/**
 * encrypted-store Configuration
 *
 * Configuration for encrypted-store encryption and key rotation operations.
 * All values are configurable via environment variables with sensible defaults.
 *
 * ## Key Rotation Batch Size Tuning
 *
 * The batch size determines how many encrypted-store entries are processed per batch during
 * key rotation. Optimal size varies based on entry size:
 *
 * - **Small entries (addresses)**: 200-500 for 4x throughput
 * - **Medium entries (notes)**: 50-100 for balanced performance
 * - **Large entries (documents)**: 10-25 to avoid memory issues
 *
 * ### Performance Impact
 *
 * For 1M entries:
 * - Batch size 100: ~10,000 iterations (baseline)
 * - Batch size 500: ~2,000 iterations (4x faster for small entries)
 * - Batch size 25: ~40,000 iterations (slower but safer for large entries)
 *
 * ### Trade-offs
 *
 * - **Larger batches**: Higher throughput, but more memory usage
 * - **Smaller batches**: Lower memory usage, but more database round-trips
 *
 * @see AddressKeyRotationService - Uses this configuration for batch processing
 */

import { registerAs } from '@nestjs/config';

export interface EncryptedStoreConfig {
  /**
   * Key rotation settings
   */
  rotation: {
    /**
     * Number of entries to process per batch (default: 100)
     *
     * Recommended values:
     * - Small entries: 200-500
     * - Medium entries: 50-100
     * - Large entries: 10-25
     */
    batchSize: number;

    /**
     * Continue processing on errors instead of stopping (default: true)
     *
     * When true, errors are collected but don't stop rotation.
     * When false, rotation stops on first error.
     */
    continueOnError: boolean;

    /**
     * Verify rotation by checking for stale entries (default: true)
     *
     * When enabled, performs post-rotation count check to ensure no entries
     * remain with the old key.
     */
    verifyAfterRotation: boolean;

    /**
     * Maximum number of concurrent batches for distributed rotation (default: 1)
     *
     * WARNING: Only increase this if running distributed rotation across
     * multiple containers with SELECT FOR UPDATE SKIP LOCKED pattern.
     */
    maxConcurrentBatches: number;
  };
}

export default registerAs('encrypted-store', (): EncryptedStoreConfig => {
  return {
    rotation: {
      batchSize: parseInt(process.env['KEY_ROTATION_BATCH_SIZE'] ?? '100', 10),
      continueOnError: process.env['KEY_ROTATION_CONTINUE_ON_ERROR'] !== 'false',
      verifyAfterRotation: process.env['KEY_ROTATION_VERIFY_AFTER'] !== 'false',
      maxConcurrentBatches: parseInt(process.env['KEY_ROTATION_MAX_CONCURRENT_BATCHES'] ?? '1', 10)
    }
  };
});
