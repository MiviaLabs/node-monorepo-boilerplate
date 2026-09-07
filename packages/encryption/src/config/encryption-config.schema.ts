/**
 * Encryption Configuration Schema
 *
 * Zod schemas for validating encryption configuration
 */

import { z } from 'zod';

/**
 * KMS provider type enum
 *
 * @example
 * ```typescript
 * const providerType = kmsProviderTypeEnum.parse('gcp');
 * // providerType = 'gcp'
 * ```
 */
export const kmsProviderTypeEnum = z.enum([
  'gcp',
  'gcp-secret-manager',
  'env-var',
  'aws',
  'azure',
  'vault'
]);

/**
 * GCP KMS provider options schema
 *
 * @example
 * ```typescript
 * const gcpOptions = gcpKmsOptionsSchema.parse({
 *   projectId: 'my-project',
 *   locationId: 'us-east1',
 *   keyRingId: 'my-keyring',
 *   keyId: 'my-key'
 * });
 * ```
 */
export const gcpKmsOptionsSchema = z.object({
  projectId: z.string().min(1),
  locationId: z.string().min(1),
  keyRingId: z.string().min(1),
  keyId: z.string().optional(),
  credentialsFile: z.string().optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  endpoint: z.string().url().optional()
});

/**
 * AWS KMS provider options schema
 *
 * @example
 * ```typescript
 * const awsOptions = awsKmsOptionsSchema.parse({
 *   region: 'us-east-1',
 *   keyId: 'alias/my-key'
 * });
 * ```
 */
export const awsKmsOptionsSchema = z.object({
  region: z.string().min(1),
  keyId: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
  endpoint: z.string().url().optional()
});

/**
 * Azure Key Vault provider options schema
 *
 * @example
 * ```typescript
 * const azureOptions = azureKeyVaultOptionsSchema.parse({
 *   vaultUrl: 'https://my-vault.vault.azure.net',
 *   keyName: 'my-key',
 *   credentialType: 'default'
 * });
 * ```
 */
export const azureKeyVaultOptionsSchema = z.object({
  vaultUrl: z.string().url(),
  keyName: z.string().optional(),
  keyVersion: z.string().optional(),
  credentialType: z.enum(['default', 'managedIdentity', 'clientSecret']).optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  tenantId: z.string().optional()
});

/**
 * Vault Transit provider options schema
 *
 * @example
 * ```typescript
 * const vaultOptions = vaultTransitOptionsSchema.parse({
 *   address: 'https://vault.example.com:8200',
 *   token: 'hvs.xxxxx',
 *   enginePath: 'transit',
 *   keyName: 'my-key'
 * });
 * ```
 */
export const vaultTransitOptionsSchema = z.object({
  address: z.string().url(),
  token: z.string().min(1),
  enginePath: z.string().optional(),
  keyName: z.string().optional(),
  namespace: z.string().optional()
});

/**
 * GCP Secret Manager provider options schema
 *
 * @example
 * ```typescript
 * const gcpSmOptions = gcpSecretManagerOptionsSchema.parse({
 *   projectId: 'my-project',
 *   secretPrefix: 'encryption-keys/'
 * });
 * ```
 */
export const gcpSecretManagerOptionsSchema = z.object({
  projectId: z.string().min(1),
  credentialsFile: z.string().optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  endpoint: z.string().url().optional(),
  secretPrefix: z.string().optional(),
  enableVersioning: z.boolean().optional(),
  kmsConfig: z
    .object({
      locationId: z.string().min(1),
      keyRingId: z.string().min(1),
      keyId: z.string().min(1)
    })
    .optional()
});

/**
 * Environment Variable provider options schema
 *
 * WARNING: Development and testing only - NOT for production use
 *
 * @example
 * ```typescript
 * const envOptions = envVarOptionsSchema.parse({
 *   encryptionKey: 'a'.repeat(64),
 *   defaultKeyId: 'default'
 * });
 * ```
 */
export const envVarOptionsSchema = z.object({
  envPrefix: z.string().optional(),
  encryptionKey: z.string().optional(),
  defaultKeyId: z.string().optional(),
  keys: z.record(z.string(), z.string()).optional(),
  allowProduction: z.boolean().optional(),
  strictProductionCheck: z.boolean().optional()
});

/**
 * KMS provider configuration schema
 *
 * @example
 * ```typescript
 * const providerConfig = kmsProviderConfigSchema.parse({
 *   type: 'gcp',
 *   default: true,
 *   options: {
 *     projectId: 'my-project',
 *     locationId: 'us-east1',
 *     keyRingId: 'my-keyring',
 *     keyId: 'my-key'
 *   }
 * });
 * ```
 */
export const kmsProviderConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('gcp'),
    default: z.boolean().optional(),
    options: gcpKmsOptionsSchema
  }),
  z.object({
    type: z.literal('gcp-secret-manager'),
    default: z.boolean().optional(),
    options: gcpSecretManagerOptionsSchema
  }),
  z.object({
    type: z.literal('env-var'),
    default: z.boolean().optional(),
    options: envVarOptionsSchema
  }),
  z.object({
    type: z.literal('aws'),
    default: z.boolean().optional(),
    options: awsKmsOptionsSchema
  }),
  z.object({
    type: z.literal('azure'),
    default: z.boolean().optional(),
    options: azureKeyVaultOptionsSchema
  }),
  z.object({
    type: z.literal('vault'),
    default: z.boolean().optional(),
    options: vaultTransitOptionsSchema
  })
]);

/**
 * Encryption options schema
 *
 * @example
 * ```typescript
 * const options = encryptionOptionsSchema.parse({
 *   algorithm: 'aes-256-gcm',
 *   enableDecorators: true,
 *   enableMetrics: true
 * });
 * ```
 */
export const encryptionOptionsSchema = z.object({
  algorithm: z.enum(['aes-256-gcm', 'aes-128-gcm']).optional(),
  enableDecorators: z.boolean().optional(),
  enableMetrics: z.boolean().optional()
});

/**
 * Full encryption module configuration schema
 *
 * @example
 * ```typescript
 * const config = encryptionConfigSchema.parse({
 *   providers: [{
 *     type: 'gcp',
 *     default: true,
 *     options: {
 *       projectId: 'my-project',
 *       locationId: 'us-east1',
 *       keyRingId: 'my-keyring',
 *       keyId: 'my-key'
 *     }
 *   }],
 *   encryption: {
 *     algorithm: 'aes-256-gcm',
 *     enableDecorators: true
 *   }
 * });
 * ```
 */
export const encryptionConfigSchema = z.object({
  providers: z.array(kmsProviderConfigSchema).min(1),
  encryption: encryptionOptionsSchema.optional()
});

/**
 * Type inference from schemas
 */
export type GcpKmsOptions = z.infer<typeof gcpKmsOptionsSchema>;
export type AwsKmsOptions = z.infer<typeof awsKmsOptionsSchema>;
export type AzureKeyVaultOptions = z.infer<typeof azureKeyVaultOptionsSchema>;
export type VaultTransitOptions = z.infer<typeof vaultTransitOptionsSchema>;
export type GcpSecretManagerOptions = z.infer<typeof gcpSecretManagerOptionsSchema>;
export type EnvVarOptions = z.infer<typeof envVarOptionsSchema>;
export type KmsProviderConfigSchema = z.infer<typeof kmsProviderConfigSchema>;
export type EncryptionConfig = z.infer<typeof encryptionConfigSchema>;
