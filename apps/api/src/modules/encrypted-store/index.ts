/**
 * @module EncryptedStore
 * @description PII vault module for secure storage and management of personally identifiable information.
 */

export { EncryptedStoreService } from './encrypted-store.service';
export { EncryptedStoreKeyService } from './encrypted-store-key.service';
export { SecureVaultController } from './encrypted-store.controller';
export { EncryptedStoreEntryRepository } from './repositories/encrypted-store-entry.repository';

// KMS rotation orchestration and polling
export { KmsRotationPollService } from './services';
export { KmsRotationOrchestratorService } from './services';
export type { KmsRotationOrchestratorInput, KmsRotationPollResult } from './services';

// Vault Key Rotation Job (vault-wide BullMQ job processor)
export {
  KmsRotationPollJob,
  KMS_ROTATION_POLL_QUEUE,
  EncryptedStoreKeyRotationJob,
  ENCRYPTED_STORE_KEY_ROTATION_QUEUE
} from './jobs';
export type { KmsRotationPollJobData, VaultKeyRotationJobPayload } from './jobs';

// DTOs
export { StoreDataDto, EncryptedStoreEntryResponseDto, KeyRotationResponseDto } from './dtos';

// Entities
export {
  EncryptedStoreEntry,
  VaultEntryCreatedEvent,
  VaultEntryUpdatedEvent,
  VaultEntryAccessedEvent,
  VaultKeyRotatedEvent,
  type VaultEntryState,
  type VaultEntryCreatedData,
  type VaultEntryUpdatedData,
  type VaultEntryAccessedData,
  type VaultKeyRotatedData
} from './entities';

// Service types
export type { VaultServiceOptions } from './encrypted-store.service';
