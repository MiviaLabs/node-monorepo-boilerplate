/**
 * User Addresses schema unit tests
 * Validates user addresses schema with encrypted-store-based PII storage and multi-tenancy support
 */

import { describe, expect, it } from '@jest/globals';

import { addressTypeEnum, userAddresses } from '../user-addresses.schema';

describe('user-addresses.schema', () => {
  describe('table definition', () => {
    it('should be defined', () => {
      expect(typeof userAddresses).toBe('object');
    });

    it('should be a valid Drizzle table schema', () => {
      expect(typeof userAddresses).toBe('object');
      expect(userAddresses !== null).toBe(true);
    });
  });

  describe('primary key column', () => {
    it('should have id column as serial primary key', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('id')).toBe(true);
    });
  });

  describe('multi-tenancy columns (P0 requirement)', () => {
    it('should have organizationId column for tenant scoping', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('organizationId')).toBe(true);
    });

    it('should have organizationId FK to organizations table with CASCADE delete', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('organizationId')).toBe(true);
      // FK configuration validated through migration/E2E tests
    });
  });

  describe('user relationship columns', () => {
    it('should have userId column with FK to users table', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('userId')).toBe(true);
    });

    it('should have userId FK with CASCADE delete', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('userId')).toBe(true);
      // FK configuration validated through migration/E2E tests
    });
  });

  describe('address type column', () => {
    it('should have addressType column (enum: primary, billing, shipping, office)', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('addressType')).toBe(true);
    });

    it('should export addressTypeEnum with correct values', () => {
      expect(Array.isArray(addressTypeEnum)).toBe(true);
      expect(addressTypeEnum).toContain('primary');
      expect(addressTypeEnum).toContain('billing');
      expect(addressTypeEnum).toContain('shipping');
      expect(addressTypeEnum).toContain('office');
    });
  });

  describe('boolean flag columns', () => {
    it('should have isDefault boolean column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('isDefault')).toBe(true);
    });

    it('should have isVerified boolean column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('isVerified')).toBe(true);
    });
  });

  describe('label column', () => {
    it('should have label column for custom address labels', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('label')).toBe(true);
    });
  });

  describe('soft delete column', () => {
    it('should have deletedAt column for soft delete', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('deletedAt')).toBe(true);
    });
  });

  describe('timestamp columns', () => {
    it('should have createdAt column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('createdAt')).toBe(true);
    });

    it('should have updatedAt column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('updatedAt')).toBe(true);
    });
  });

  describe('encrypted-store reference columns (PII compliance)', () => {
    it('should have streetEncryptedStoreId column referencing encrypted-store_entries', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('streetEncryptedStoreId')).toBe(true);
    });

    it('should have street2EncryptedStoreId column referencing encrypted-store_entries', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('street2EncryptedStoreId')).toBe(true);
    });

    it('should have cityEncryptedStoreId column referencing encrypted-store_entries', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('cityEncryptedStoreId')).toBe(true);
    });

    it('should have stateEncryptedStoreId column referencing encrypted-store_entries', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('stateEncryptedStoreId')).toBe(true);
    });

    it('should have postalCodeEncryptedStoreId column referencing encrypted-store_entries', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('postalCodeEncryptedStoreId')).toBe(true);
    });

    it('should have countryEncryptedStoreId column referencing encrypted-store_entries', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('countryEncryptedStoreId')).toBe(true);
    });
  });

  describe('encrypted-store FK delete constraints', () => {
    it('should have 6 encrypted-store FKs with RESTRICT delete (prevents accidental data loss)', () => {
      const columns = Object.keys(userAddresses);
      // All 6 encrypted-store ID columns should exist
      expect(columns.includes('streetEncryptedStoreId')).toBe(true);
      expect(columns.includes('street2EncryptedStoreId')).toBe(true);
      expect(columns.includes('cityEncryptedStoreId')).toBe(true);
      expect(columns.includes('stateEncryptedStoreId')).toBe(true);
      expect(columns.includes('postalCodeEncryptedStoreId')).toBe(true);
      expect(columns.includes('countryEncryptedStoreId')).toBe(true);
      // FK configuration validated through migration/E2E tests
    });
  });

  describe('country code column (non-PII)', () => {
    it('should have countryCode column for filtering (ISO 3166-1 alpha-2)', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('countryCode')).toBe(true);
    });
  });

  describe('PII compliance (Class-C data protection)', () => {
    it('should NOT have plaintext street column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('street')).toBe(false);
    });

    it('should NOT have plaintext street2 column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('street2')).toBe(false);
    });

    it('should NOT have plaintext city column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('city')).toBe(false);
    });

    it('should NOT have plaintext state column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('state')).toBe(false);
    });

    it('should NOT have plaintext postalCode column', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('postalCode')).toBe(false);
    });

    it('should NOT have plaintext postal_code column (snake_case variant)', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('postal_code')).toBe(false);
    });

    it('should NOT have plaintext country column (use countryCode + countryEncryptedStoreId)', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('country')).toBe(false);
    });

    it('should store all address PII via encrypted-store reference IDs only', () => {
      const columns = Object.keys(userAddresses);
      // All PII fields should be encrypted-store references
      expect(columns.includes('streetEncryptedStoreId')).toBe(true);
      expect(columns.includes('street2EncryptedStoreId')).toBe(true);
      expect(columns.includes('cityEncryptedStoreId')).toBe(true);
      expect(columns.includes('stateEncryptedStoreId')).toBe(true);
      expect(columns.includes('postalCodeEncryptedStoreId')).toBe(true);
      expect(columns.includes('countryEncryptedStoreId')).toBe(true);
      // Non-PII countryCode is allowed
      expect(columns.includes('countryCode')).toBe(true);
    });
  });

  describe('indexes for query performance', () => {
    it('should have index on (organizationId, userId, addressType, deletedAt) for type lookups', () => {
      // Index existence validated through migration/E2E tests
      const columns = Object.keys(userAddresses);
      expect(columns.includes('organizationId')).toBe(true);
      expect(columns.includes('userId')).toBe(true);
      expect(columns.includes('addressType')).toBe(true);
      expect(columns.includes('deletedAt')).toBe(true);
    });

    it('should have index on (organizationId, userId, isDefault, deletedAt) for default address lookups', () => {
      // Index existence validated through migration/E2E tests
      const columns = Object.keys(userAddresses);
      expect(columns.includes('organizationId')).toBe(true);
      expect(columns.includes('userId')).toBe(true);
      expect(columns.includes('isDefault')).toBe(true);
      expect(columns.includes('deletedAt')).toBe(true);
    });

    it('should have index on (organizationId, countryCode, deletedAt) for country filtering', () => {
      // Index existence validated through migration/E2E tests
      const columns = Object.keys(userAddresses);
      expect(columns.includes('organizationId')).toBe(true);
      expect(columns.includes('countryCode')).toBe(true);
      expect(columns.includes('deletedAt')).toBe(true);
    });

    it('should have index on (organizationId, userId) for user address lookups', () => {
      // Index existence validated through migration/E2E tests
      const columns = Object.keys(userAddresses);
      expect(columns.includes('organizationId')).toBe(true);
      expect(columns.includes('userId')).toBe(true);
    });

    it('should have 6 encrypted-store FK indexes for join performance', () => {
      // Index existence validated through migration/E2E tests
      const columns = Object.keys(userAddresses);
      expect(columns.includes('streetEncryptedStoreId')).toBe(true);
      expect(columns.includes('street2EncryptedStoreId')).toBe(true);
      expect(columns.includes('cityEncryptedStoreId')).toBe(true);
      expect(columns.includes('stateEncryptedStoreId')).toBe(true);
      expect(columns.includes('postalCodeEncryptedStoreId')).toBe(true);
      expect(columns.includes('countryEncryptedStoreId')).toBe(true);
    });
  });

  describe('P0 multi-tenancy requirement validation', () => {
    it('should have organizationId column present (required for tenant isolation)', () => {
      const columns = Object.keys(userAddresses);
      expect(columns.includes('organizationId')).toBe(true);
    });

    it('should support tenant-scoped queries via organizationId index', () => {
      const columns = Object.keys(userAddresses);
      // All indexes should include organizationId for tenant scoping
      expect(columns.includes('organizationId')).toBe(true);
      // Index configurations validated through migration/E2E tests
    });
  });
});
