/**
 * Infrastructure Secrets Configuration Defaults
 * ==============================================
 * This file defines default values for all configuration options.
 * These defaults are used by the ConfigResolver when no user config or environment variable is provided.
 */

import type { GcpSecretManagerConfig, HashiCorpVaultConfig, OnePasswordConfig } from './interfaces';

/**
 * Default GCP Secret Manager configuration
 */
export const DEFAULT_GCP_CONFIG: GcpSecretManagerConfig = {
  kmsKeyLocation: 'global',
  kmsKeyRingId: 'vault-keys',
  kmsKeyId: 'vault-key'
};

/**
 * Default HashiCorp Vault configuration
 */
export const DEFAULT_HASHICORP_CONFIG: HashiCorpVaultConfig = {
  addr: 'http://localhost:8200'
};

/**
 * Default 1Password configuration
 */
export const DEFAULT_ONEPASSWORD_CONFIG: OnePasswordConfig = {
  connectHost: 'http://localhost:8080',
  vaultId: 'runtime-secrets',
  itemName: 'Runtime Secrets',
  fieldName: 'notes',
  cacheTtl: 300000 // 5 minutes
};

/**
 * Default environment variable names
 * These are the standard names used throughout the codebase
 */
export const DEFAULT_ENV_VAR_NAMES = {
  // Provider selection
  SECRET_PROVIDER: 'SECRET_PROVIDER',

  // GCP variables
  GOOGLE_CLOUD_PROJECT: 'GOOGLE_CLOUD_PROJECT',
  GOOGLE_APPLICATION_CREDENTIALS: 'GOOGLE_APPLICATION_CREDENTIALS',
  KMS_KEY_LOCATION: 'KMS_KEY_LOCATION',
  KMS_KEY_RING_ID: 'KMS_KEY_RING_ID',
  KMS_KEY_ID: 'KMS_KEY_ID',

  // HashiCorp variables
  VAULT_ADDR: 'VAULT_ADDR',
  VAULT_TOKEN: 'VAULT_TOKEN',
  VAULT_NAMESPACE: 'VAULT_NAMESPACE',
  VAULT_ROLE_ID: 'VAULT_ROLE_ID',
  VAULT_SECRET_ID: 'VAULT_SECRET_ID',

  // 1Password variables
  OP_CONNECT_HOST: 'OP_CONNECT_HOST',
  OP_SERVICE_ACCOUNT_TOKEN: 'OP_SERVICE_ACCOUNT_TOKEN',
  OP_VAULT_ID: 'OP_VAULT_ID',
  OP_ITEM_NAME: 'OP_ITEM_NAME',
  OP_FIELD_NAME: 'OP_FIELD_NAME'
} as const;
