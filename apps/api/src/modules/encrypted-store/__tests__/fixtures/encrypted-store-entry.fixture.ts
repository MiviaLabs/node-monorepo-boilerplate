/**
 * Vault Entry Test Fixtures
 *
 * Factory functions and test data builders for vault entry tests.
 * Follows existing fixture patterns in the codebase.
 *
 * Provides:
 * - Factory functions for creating mock vault entries
 * - Test data builders with sensible defaults
 * - Test data constants for common scenarios
 */

import { AccessLogAction } from '@package/db-core';

import type { DataClassification, DataCategory } from '@package/types';

/**
 * Mock Vault Entry interface
 *
 * Represents the structure of a vault entry record in the database.
 * Matches the EncryptedStoreEntryRepository type definition.
 */
export interface MockVaultEntry {
  id: number;
  organizationId: number;
  entityType: string;
  entityId: number;
  fieldPath: string;
  ciphertext: string;
  encryptedDataKey: string;
  iv: string;
  authTag: string;
  keyId: string;
  classification: string;
  category: string;
  accessLog: Array<{
    timestamp: Date;
    accessedBy: number;
    action: AccessLogAction;
    ipAddress?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
  rotatedAt: Date | null;
}

/**
 * Create Vault Entry data interface
 *
 * Represents the data required to create a new vault entry.
 */
export interface CreateVaultEntryData {
  organizationId: number;
  entityType: string;
  entityId: number;
  fieldPath: string;
  ciphertext: string;
  encryptedDataKey: string;
  iv: string;
  authTag: string;
  keyId: string;
  classification: string;
  category: string;
  accessLog?: Array<{
    timestamp: Date;
    accessedBy: number;
    action: AccessLogAction;
    ipAddress?: string;
  }>;
}

/**
 * Default values for vault entry fixtures
 *
 * Note: classification defaults to 'internal' to match EncryptedStoreService behavior
 */
const DEFAULT_VAULT_ENTRY_VALUES = {
  entityType: 'user',
  fieldPath: 'email',
  ciphertext: 'encrypted-ciphertext-base64',
  encryptedDataKey: 'encrypted-data-key-base64',
  iv: 'initialization-vector-base64',
  authTag: 'authentication-tag-base64',
  keyId: 'key-123',
  classification: 'internal' as DataClassification,
  category: 'pii' as DataCategory,
  accessLog: [],
  rotatedAt: null
};

/**
 * Factory function to create a mock vault entry
 *
 * @param overrides - Partial vault entry data to override defaults
 * @returns Mock vault entry object
 *
 * @example
 * ```typescript
 * const mockEntry = createMockVaultEntry({
 *   id: 1,
 *   organizationId: 123,
 *   entityType: 'user',
 *   fieldPath: 'ssn',
 *   classification: 'restricted',
 * });
 * ```
 */
export function createMockVaultEntry(overrides: Partial<MockVaultEntry> = {}): MockVaultEntry {
  const now = new Date();

  return {
    id: 1,
    organizationId: 123,
    entityId: 456,
    createdAt: now,
    updatedAt: now,
    ...DEFAULT_VAULT_ENTRY_VALUES,
    ...overrides
  };
}

/**
 * Factory function to create vault entry creation data
 *
 * @param overrides - Partial data to override defaults
 * @returns Vault entry creation data
 *
 * @example
 * ```typescript
 * const createData = createVaultEntryData({
 *   organizationId: 123,
 *   entityType: 'organization',
 *   fieldPath: 'tax-id',
 *   classification: 'restricted',
 * });
 * ```
 */
export function createVaultEntryData(
  overrides: Partial<CreateVaultEntryData> = {}
): CreateVaultEntryData {
  return {
    organizationId: 123,
    entityType: 'user',
    entityId: 456,
    fieldPath: 'email',
    ciphertext: 'encrypted-ciphertext-base64',
    encryptedDataKey: 'encrypted-data-key-base64',
    iv: 'initialization-vector-base64',
    authTag: 'authentication-tag-base64',
    keyId: 'key-123',
    classification: 'internal',
    category: 'pii',
    accessLog: [],
    ...overrides
  };
}

/**
 * Create multiple mock vault entries
 *
 * @param count - Number of entries to create
 * @param overrides - Partial data to apply to all entries
 * @returns Array of mock vault entries
 *
 * @example
 * ```typescript
 * const mockEntries = createMockVaultEntries(5, {
 *   organizationId: 123,
 *   classification: 'restricted',
 * });
 * ```
 */
export function createMockVaultEntries(
  count: number,
  overrides: Partial<MockVaultEntry> = {}
): MockVaultEntry[] {
  const entries: MockVaultEntry[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    entries.push({
      id: i + 1,
      organizationId: 123,
      entityId: 456 + i,
      createdAt: new Date(now.getTime() - i * 1000),
      updatedAt: new Date(now.getTime() - i * 1000),
      ...DEFAULT_VAULT_ENTRY_VALUES,
      ...overrides
    });
  }

  return entries;
}

/**
 * Create a mock access log entry
 *
 * @param overrides - Partial data to override defaults
 * @returns Mock access log entry
 *
 * @example
 * ```typescript
 * const accessLog = createMockAccessLogEntry({
 *   accessedBy: 789,
 *   action: AccessLogAction.RETRIEVED,
 * });
 * ```
 */
export function createMockAccessLogEntry(
  overrides: {
    accessedBy?: number;
    action?: AccessLogAction;
    timestamp?: Date;
    ipAddress?: string;
  } = {}
): {
  timestamp: Date;
  accessedBy: number;
  action: AccessLogAction;
  ipAddress?: string;
} {
  return {
    timestamp: new Date(),
    accessedBy: 789,
    action: AccessLogAction.STORED,
    ...overrides
  };
}

/**
 * Create a mock vault entry with access log
 *
 * @param accessLogCount - Number of access log entries to include
 * @param overrides - Partial vault entry data to override defaults
 * @returns Mock vault entry with access log
 *
 * @example
 * ```typescript
 * const entryWithLog = createMockVaultEntryWithAccessLog(3, {
 *   fieldPath: 'ssn',
 *   classification: 'restricted',
 * });
 * ```
 */
export function createMockVaultEntryWithAccessLog(
  accessLogCount: number,
  overrides: Partial<MockVaultEntry> = {}
): MockVaultEntry {
  const accessLog: Array<{
    timestamp: Date;
    accessedBy: number;
    action: AccessLogAction;
    ipAddress?: string;
  }> = [];

  const now = new Date();
  for (let i = 0; i < accessLogCount; i++) {
    accessLog.push({
      timestamp: new Date(now.getTime() - (accessLogCount - i) * 1000),
      accessedBy: 789 + i,
      action: i === 0 ? AccessLogAction.STORED : AccessLogAction.RETRIEVED
    });
  }

  return createMockVaultEntry({
    ...overrides,
    accessLog
  });
}

/**
 * Test data constants for common vault entry scenarios
 */
export const VAULT_ENTRY_TEST_DATA = {
  /**
   * Standard user email vault entry (internal classification)
   */
  USER_EMAIL: {
    entityType: 'user',
    fieldPath: 'email',
    classification: 'internal',
    category: 'pii'
  } as const,

  /**
   * User SSN vault entry (restricted data)
   */
  USER_SSN: {
    entityType: 'user',
    fieldPath: 'ssn',
    classification: 'restricted',
    category: 'government_id'
  } as const,

  /**
   * Organization tax ID vault entry
   */
  ORG_TAX_ID: {
    entityType: 'organization',
    fieldPath: 'tax-id',
    classification: 'restricted',
    category: 'financial'
  } as const,

  /**
   * Payment method vault entry
   */
  PAYMENT_METHOD: {
    entityType: 'payment_method',
    fieldPath: 'card-number',
    classification: 'restricted',
    category: 'financial'
  } as const,

  /**
   * Document vault entry
   */
  DOCUMENT: {
    entityType: 'document',
    fieldPath: 'content',
    classification: 'confidential',
    category: 'custom'
  } as const
} as const;

/**
 * Create a mock vault entry from test data constant
 *
 * @param testDataConstant - Test data constant from VAULT_ENTRY_TEST_DATA
 * @param overrides - Additional overrides
 * @returns Mock vault entry
 *
 * @example
 * ```typescript
 * const ssnEntry = createMockFromTestDataConstant(
 *   VAULT_ENTRY_TEST_DATA.USER_SSN,
 *   { entityId: 789 }
 * );
 * ```
 */
export function createMockFromTestDataConstant(
  testDataConstant: (typeof VAULT_ENTRY_TEST_DATA)[keyof typeof VAULT_ENTRY_TEST_DATA],
  overrides: Partial<MockVaultEntry> = {}
): MockVaultEntry {
  return createMockVaultEntry({
    entityType: testDataConstant.entityType,
    fieldPath: testDataConstant.fieldPath,
    classification: testDataConstant.classification,
    category: testDataConstant.category,
    ...overrides
  });
}
