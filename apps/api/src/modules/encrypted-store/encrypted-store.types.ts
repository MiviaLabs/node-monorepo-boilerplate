/**
 * PII Vault Types
 *
 * Shared types and enums for the PII vault module.
 */

import { AccessLogAction } from '@package/db-core';

// Re-export AccessLogAction from db-core for convenience
export { AccessLogAction };

/**
 * Vault access log entry (for database operations)
 *
 * Represents a single access log entry in the vault entry's access log array.
 * Note: timestamp is stored as ISO string in the database schema.
 */
export interface VaultAccessLogEntry {
  readonly timestamp: string; // ISO string format
  readonly accessedBy: number;
  readonly action: AccessLogAction;
  readonly ipAddress?: string;
}

/**
 * Vault access log entry (for application code)
 *
 * Same as VaultAccessLogEntry but with Date object for convenience.
 */
export interface VaultAccessLogEntryDto {
  readonly timestamp: Date;
  readonly accessedBy: number;
  readonly action: AccessLogAction;
  readonly ipAddress?: string;
}
