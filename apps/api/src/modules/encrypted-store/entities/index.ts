/**
 * @module PiiVaultEntities
 * @description Domain entities and events for the PII vault including vault entries and audit events.
 */

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
} from './encrypted-store-entry.entity';
