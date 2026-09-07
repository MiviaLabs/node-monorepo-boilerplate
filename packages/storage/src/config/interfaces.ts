export const STORAGE_PROVIDER_TYPES = ['s3'] as const;

export type StorageProviderType = (typeof STORAGE_PROVIDER_TYPES)[number];

export interface IS3StorageConfig {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  sessionToken?: string;
  bucket?: string;
  publicBaseUrl?: string;
  signedUrlExpiresInSeconds?: number;
}

export interface StorageEnvironmentVariableNames {
  STORAGE_INSTANCES?: string;
  STORAGE_DEFAULT_INSTANCE?: string;
  STORAGE_PROVIDER?: string;
  STORAGE_DEFAULT_BUCKET?: string;
  STORAGE_S3_ENDPOINT?: string;
  STORAGE_S3_REGION?: string;
  STORAGE_S3_ACCESS_KEY_ID?: string;
  STORAGE_S3_SECRET_ACCESS_KEY?: string;
  STORAGE_S3_SESSION_TOKEN?: string;
  STORAGE_S3_FORCE_PATH_STYLE?: string;
  STORAGE_S3_BUCKET?: string;
  STORAGE_S3_PUBLIC_BASE_URL?: string;
  STORAGE_S3_SIGNED_URL_EXPIRES_IN_SECONDS?: string;
  STORAGE_TEST_MODE?: string;
}

export interface IStorageConfig {
  provider?: StorageProviderType;
  defaultBucket?: string;
  s3?: IS3StorageConfig;
  envVarNames?: Partial<StorageEnvironmentVariableNames>;
  testMode?: boolean;
}

export interface IStorageConfigsInput {
  defaultInstance?: string;
  storages?: Record<string, IStorageConfig>;
}

export interface ResolvedS3StorageConfig {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  sessionToken?: string;
  bucket: string;
  publicBaseUrl?: string;
  signedUrlExpiresInSeconds: number;
}

export interface ResolvedStorageConfig {
  provider: StorageProviderType;
  defaultBucket: string;
  s3: ResolvedS3StorageConfig;
  testMode: boolean;
}

export interface ResolvedStorageConfigs {
  defaultInstance: string;
  storages: Record<string, ResolvedStorageConfig>;
}
