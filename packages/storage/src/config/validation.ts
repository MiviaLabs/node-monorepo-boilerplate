import { MAX_SIGNED_URL_EXPIRES_IN_SECONDS } from './defaults';
import { StorageConfigurationError } from '../errors';

import type { ResolvedStorageConfig } from './interfaces';

function ensurePresent(value: string, message: string): void {
  if (value.trim().length === 0) {
    throw new StorageConfigurationError(message);
  }
}

function validateUrl(value: string | undefined, fieldName: string): void {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return;
  }

  try {
    new URL(normalizedValue);
  } catch (error) {
    throw new StorageConfigurationError(
      `${fieldName} must be a valid URL`,
      error instanceof Error ? error : undefined
    );
  }
}

export function clampSignedUrlExpiresInSeconds(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new StorageConfigurationError('signedUrlExpiresInSeconds must be a positive integer');
  }

  return Math.min(value, MAX_SIGNED_URL_EXPIRES_IN_SECONDS);
}

export function validateStorageConfig(config: ResolvedStorageConfig): ResolvedStorageConfig {
  if (config.provider !== 's3') {
    throw new StorageConfigurationError(
      `Unsupported storage provider "${config.provider}". Valid values are: s3`
    );
  }

  ensurePresent(config.s3.region, 'S3 region is required');
  ensurePresent(config.s3.accessKeyId, 'S3 accessKeyId is required');
  ensurePresent(config.s3.secretAccessKey, 'S3 secretAccessKey is required');
  ensurePresent(config.defaultBucket, 'A default storage bucket is required');

  validateUrl(config.s3.endpoint, 'S3 endpoint');
  validateUrl(config.s3.publicBaseUrl, 'S3 publicBaseUrl');

  const signedUrlExpiresInSeconds = clampSignedUrlExpiresInSeconds(
    config.s3.signedUrlExpiresInSeconds
  );

  return {
    ...config,
    defaultBucket: config.defaultBucket.trim(),
    s3: {
      ...config.s3,
      region: config.s3.region.trim(),
      accessKeyId: config.s3.accessKeyId.trim(),
      secretAccessKey: config.s3.secretAccessKey.trim(),
      sessionToken: config.s3.sessionToken?.trim() || undefined,
      bucket: config.s3.bucket.trim(),
      publicBaseUrl: config.s3.publicBaseUrl?.trim() || undefined,
      endpoint: config.s3.endpoint?.trim() || undefined,
      signedUrlExpiresInSeconds
    }
  };
}
