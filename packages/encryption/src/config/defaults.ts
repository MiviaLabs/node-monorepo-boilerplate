/**
 * Default configuration values for encryption package
 *
 * These defaults are designed for production use with balanced
 * security, performance, and resource consumption.
 */

import { AzureCredentialType, EncryptionAlgorithm } from '../constants';

import type {
  IResolvedGcpKmsConfig,
  IResolvedAwsKmsConfig,
  IResolvedAzureKeyVaultConfig,
  IResolvedVaultTransitConfig,
  IResolvedEncryptionOptionsConfig
} from './interfaces';

/**
 * Default GCP KMS configuration
 *
 * Note: Most properties are required for GCP KMS to function.
 * These defaults should be overridden via environment variables or user config.
 */
export const DEFAULT_GCP_KMS_CONFIG: Omit<
  IResolvedGcpKmsConfig,
  'projectId' | 'locationId' | 'keyRingId' | 'keyId'
> & {
  projectId?: string;
  locationId?: string;
  keyRingId?: string;
  keyId?: string;
} = {};

/**
 * Default AWS KMS configuration
 *
 * Note: AWS region is required. Other properties can use AWS default credential chain.
 */
export const DEFAULT_AWS_KMS_CONFIG: Omit<IResolvedAwsKmsConfig, 'region'> & {
  region?: string;
} = {};

/**
 * Default Azure Key Vault configuration
 */
export const DEFAULT_AZURE_KEY_VAULT_CONFIG: Omit<IResolvedAzureKeyVaultConfig, 'vaultUrl'> & {
  vaultUrl?: string;
} = {
  credentialType: AzureCredentialType.DEFAULT
};

/**
 * Default Vault Transit configuration
 */
export const DEFAULT_VAULT_TRANSIT_CONFIG: Omit<
  IResolvedVaultTransitConfig,
  'address' | 'token' | 'enginePath'
> & {
  address?: string;
  token?: string;
  enginePath?: string;
} = {
  enginePath: 'transit'
};

/**
 * Default encryption options configuration
 */
export const DEFAULT_ENCRYPTION_CONFIG: IResolvedEncryptionOptionsConfig = {
  algorithm: EncryptionAlgorithm.AES_256_GCM,
  enableDecorators: true,
  enableMetrics: true
};
