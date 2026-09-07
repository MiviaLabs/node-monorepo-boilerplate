import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for triggering a manual address key rotation via the admin endpoint.
 *
 * Used by: POST /api/v1/users/addresses/rotate-key
 *
 * ## P0 Security
 * - `oldKeyId` and `newKeyId` are KMS **resource IDs**, not key material.
 * - The rotation is scoped to the tenant identified by the `x-tenant-id` header.
 * - Requires `CRYPTO_KEY_ROTATE` permission enforced by HybridPolicyGuard.
 */
export class TriggerKeyRotationDto {
  /**
   * Old KMS key resource ID to rotate from.
   *
   * This is the key's resource identifier (e.g., GCP KMS CryptoKeyVersion path),
   * NOT the actual cryptographic key material.
   *
   * @example 'projects/my-project/locations/global/keyRings/my-ring/cryptoKeys/addr-kek/cryptoKeyVersions/1'
   */
  @ApiProperty({
    description: 'Old KMS key resource ID to rotate from (not key material)',
    example:
      'projects/my-project/locations/global/keyRings/my-ring/cryptoKeys/addr-kek/cryptoKeyVersions/1'
  })
  @IsString()
  @IsNotEmpty()
  oldKeyId!: string;

  /**
   * New KMS key resource ID to rotate to.
   *
   * This is the key's resource identifier (e.g., GCP KMS CryptoKeyVersion path),
   * NOT the actual cryptographic key material.
   *
   * @example 'projects/my-project/locations/global/keyRings/my-ring/cryptoKeys/addr-kek/cryptoKeyVersions/2'
   */
  @ApiProperty({
    description: 'New KMS key resource ID to rotate to (not key material)',
    example:
      'projects/my-project/locations/global/keyRings/my-ring/cryptoKeys/addr-kek/cryptoKeyVersions/2'
  })
  @IsString()
  @IsNotEmpty()
  newKeyId!: string;

  /**
   * Optional correlation ID for distributed tracing.
   *
   * If not provided, a deterministic ID based on tenantId + oldKeyId + newKeyId is used.
   * Useful for correlating manual trigger requests with job processing logs.
   *
   * @example 'admin-rotation-2026-03-07-001'
   */
  @ApiPropertyOptional({
    description: 'Optional correlation ID for distributed tracing',
    example: 'admin-rotation-2026-03-07-001'
  })
  @IsString()
  @IsOptional()
  correlationId?: string;
}

/**
 * Response DTO for the manual key rotation trigger endpoint.
 *
 * Returns the BullMQ job ID so the caller can poll rotation status
 * or track execution in logs.
 */
export class TriggerKeyRotationResponseDto {
  /**
   * BullMQ job ID assigned to the enqueued rotation job.
   *
   * This ID is deterministic (tenant + oldKeyId + timestamp) to
   * prevent duplicate jobs for the same rotation request.
   *
   * @example 'rotate-1-old-key-1741363200000'
   */
  @ApiProperty({
    description: 'BullMQ job ID for tracking rotation status',
    example: 'rotate-1-old-key-1741363200000'
  })
  jobId!: string;

  /**
   * BullMQ queue name where the job was enqueued.
   *
   * @example 'address-key-rotation'
   */
  @ApiProperty({
    description: 'BullMQ queue where the job was enqueued',
    example: 'address-key-rotation'
  })
  queueName!: string;

  /**
   * HTTP-style status indicating the job was accepted for processing.
   *
   * The job is enqueued asynchronously — use `jobId` to track progress.
   */
  @ApiProperty({
    description: 'Acceptance status (job is enqueued asynchronously)',
    example: 'accepted',
    enum: ['accepted']
  })
  status!: 'accepted';
}
