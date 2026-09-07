/**
 * @fileoverview Central export hub for all database schemas, types, and utilities.
 *
 * This module organizes exports into logical sections:
 *
 * ## 1. Table Definitions
 * Drizzle table objects used in queries. Import these to reference tables
 * in `select()`, `insert()`, `update()`, and `delete()` operations.
 *
 * ## 2. Inferred Types
 * TypeScript types derived from table schemas using Drizzle's type inference:
 * - `$inferSelect` types (e.g., `User`) - Shape of rows returned from queries
 * - `$inferInsert` types (e.g., `NewUser`) - Shape for insert operations (optional fields allowed)
 *
 * ## 3. Enum Types and Values
 * Database enum definitions and their TypeScript type representations.
 *
 * ## 4. Drizzle Operators
 * Re-exported query operators (`eq`, `and`, `or`, etc.) to ensure type compatibility.
 * **Important:** Always import operators from this module, not directly from `drizzle-orm`.
 *
 * ## 5. Database Types
 * Types for database connections and transactions.
 *
 * @module @package/db-core/schema
 *
 * @example Importing tables and types
 * ```typescript
 * import {
 *   users,          // Table definition
 *   type User,      // Select type (query results)
 *   type NewUser,   // Insert type (new records)
 *   eq, and         // Query operators
 * } from '@package/db-core/schema';
 * ```
 *
 * @example Using inferred types in repositories
 * ```typescript
 * import { users, type User, type NewUser, eq } from '@package/db-core/schema';
 *
 * class UserRepository {
 *   async findById(id: string): Promise<User | null> {
 *     return db.query.users.findFirst({
 *       where: eq(users.id, id)
 *     });
 *   }
 *
 *   async create(data: NewUser): Promise<User> {
 *     const [user] = await db.insert(users).values(data).returning();
 *     return user;
 *   }
 * }
 * ```
 */

// ============================================================================
// SECTION 1: TABLE DEFINITIONS
// ============================================================================
// Drizzle table objects for building queries. Each table export is a reference
// to the database table structure with column definitions and relations.
// ============================================================================

export { users } from './users.schema';
export { userAddresses, addressTypeEnum } from './user-addresses.schema';
export { userIdentities } from './user-identities.schema';
export { tenants } from './tenants.schema';
export { organizations } from './organizations.schema';
export { projects } from './projects.schema';
export { contentEntries } from './content-entries.schema';
export { contentAttachments } from './content-attachments.schema';
export { contentComments } from './content-comments.schema';
export { files, FILE_PURPOSE_ENUM, FILE_STATUS_ENUM, FILE_VISIBILITY_ENUM } from './files.schema';
export { issues, ISSUE_PRIORITY_ENUM, ISSUE_STATUS_ENUM } from './issues.schema';
export { issueAssignees } from './issue-assignees.schema';
export { issueWatchers } from './issue-watchers.schema';
export { issueComments } from './issue-comments.schema';
export { issueLabels } from './issue-labels.schema';
export { issueLabelAssignments } from './issue-label-assignments.schema';
export { issueRelations, ISSUE_RELATION_TYPE_ENUM } from './issue-relations.schema';
export { issueActivity, ISSUE_ACTIVITY_TYPE_ENUM } from './issue-activity.schema';
export { issueAttachments } from './issue-attachments.schema';
export { projectMembers } from './project-members.schema';
export { userTenants } from './user-tenants.schema';
export { userOrganizationSettings } from './user-organization-settings.schema';
export { userRoles, systemRoleEnum } from './user-roles.schema';
export { encryptedStoreEntries } from './encrypted-store-entries.schema';
export { apiKeys } from './api-keys.schema';
export { invitations } from './invitations.schema';
export { passwordResetTokens } from './password-reset-tokens.schema';
export { keyRotationState, ROTATION_STATUS } from './key-rotation-state.schema';
export { kmsRotationCheckpoint } from './kms-rotation-checkpoint.schema';
export {
  emailMessages,
  EMAIL_MESSAGE_DIRECTION_ENUM,
  EMAIL_MESSAGE_STATUS_ENUM
} from './email-messages.schema';
export { emailProviderMessages } from './email-provider-messages.schema';
export {
  emailWebhookEvents,
  EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM,
  EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM
} from './email-webhook-events.schema';

// ============================================================================
// SECTION 2: INFERRED TYPES
// ============================================================================
// Types derived from table schemas using Drizzle's type inference system.
//
// ## Type Naming Convention
// - `EntityName` (e.g., `User`) - The "select" type representing a complete
//   database row. Generated via `$inferSelect`. Use this for:
//   - Function return types
//   - Variables holding query results
//   - DTOs representing existing records
//
// - `NewEntityName` (e.g., `NewUser`) - The "insert" type for creating records.
//   Generated via `$inferInsert`. Columns with defaults become optional. Use for:
//   - Insert operation payloads
//   - Create DTO types
//   - Factory function inputs
//
// @example Type inference in Drizzle
// ```typescript
// // In the schema file:
// export type User = typeof users.$inferSelect;    // All columns required
// export type NewUser = typeof users.$inferInsert; // Defaults are optional
// ```
// ============================================================================

export type { User, NewUser } from './users.schema';
export type {
  UserAddress,
  NewUserAddress,
  UpdateUserAddress,
  AddressType
} from './user-addresses.schema';
export type { UserIdentity, NewUserIdentity } from './user-identities.schema';
export type { Tenant, NewTenant } from './tenants.schema';
export type { Organization, NewOrganization } from './organizations.schema';
export type { Project, NewProject, ProjectVisibility } from './projects.schema';
export type { ContentEntry, NewContentEntry } from './content-entries.schema';
export type { ContentAttachment, NewContentAttachment } from './content-attachments.schema';
export type { ContentComment, NewContentComment } from './content-comments.schema';
export type {
  File,
  NewFile,
  FilePurpose,
  FileStatus,
  FileVisibility,
  IFileMetadata
} from './files.schema';
export type { Issue, NewIssue, IssuePriority, IssueStatus } from './issues.schema';
export type { IssueAssignee, NewIssueAssignee } from './issue-assignees.schema';
export type { IssueWatcher, NewIssueWatcher } from './issue-watchers.schema';
export type { IssueComment, NewIssueComment } from './issue-comments.schema';
export type { IssueLabel, NewIssueLabel } from './issue-labels.schema';
export type {
  IssueLabelAssignment,
  NewIssueLabelAssignment
} from './issue-label-assignments.schema';
export type { IssueRelation, NewIssueRelation, IssueRelationType } from './issue-relations.schema';
export type {
  IssueActivity,
  NewIssueActivity,
  IIssueActivityMetadata,
  IssueActivityType
} from './issue-activity.schema';
export type { IssueAttachment, NewIssueAttachment } from './issue-attachments.schema';
export type { ProjectMember, NewProjectMember } from './project-members.schema';
export type { UserTenant, NewUserTenant } from './user-tenants.schema';
export type {
  UserOrganizationSetting,
  NewUserOrganizationSetting,
  UserOrganizationSettingValue
} from './user-organization-settings.schema';
export type { UserRole, NewUserRole, SystemRoleDb } from './user-roles.schema';
export type { EncryptedStoreEntry, NewEncryptedStoreEntry } from './encrypted-store-entries.schema';
export type { ApiKey, NewApiKey } from './api-keys.schema';
export type { Invitation, NewInvitation } from './invitations.schema';
export type { PasswordResetToken, NewPasswordResetToken } from './password-reset-tokens.schema';
export type {
  EmailMessage,
  NewEmailMessage,
  EmailMessageDirection,
  EmailMessageStatus,
  IEmailMessageMetadata
} from './email-messages.schema';
export type {
  EmailProviderMessage,
  NewEmailProviderMessage,
  IEmailProviderMessagePayload,
  IEmailProviderMessageTags,
  IEmailProviderMessageMetadata
} from './email-provider-messages.schema';
export type {
  EmailWebhookEvent,
  NewEmailWebhookEvent,
  EmailWebhookProcessingStatus,
  EmailWebhookVerificationStatus,
  IEmailWebhookHeaders,
  IEmailWebhookPayload
} from './email-webhook-events.schema';
export type {
  KeyRotationState,
  NewKeyRotationState,
  RotationStatus,
  IRotationError
} from './key-rotation-state.schema';
export type {
  KmsRotationCheckpoint,
  NewKmsRotationCheckpoint
} from './kms-rotation-checkpoint.schema';

// ============================================================================
// SECTION 3: ENUM TYPES AND VALUES
// ============================================================================
// Database enum definitions exported as both runtime values and TypeScript types.
// Use runtime exports for comparisons and type exports for type annotations.
// ============================================================================

/** Tenant configuration and status types */
export type { ITenantSettings } from './tenants.schema';
export type { TenantType, TenantStatus } from './tenants.schema';
export type { UserTenantRole } from './user-tenants.schema';

/** encrypted-store entry classification and access types */
export type {
  EntityType,
  DataClassification,
  DataCategory,
  IAccessLogEntry
} from './encrypted-store-entries.schema';
export {
  entityTypeEnum,
  dataClassificationEnum,
  dataCategoryEnum,
  AccessLogAction
} from './encrypted-store-entries.schema';

/** Identity provider enumeration for federated authentication */
export { IdentityProvider } from './user-identities.schema';

// ============================================================================
// SECTION 4: DRIZZLE QUERY OPERATORS
// ============================================================================
// Re-exported Drizzle ORM operators for type-safe query building.
//
// ## Why Re-export Operators?
//
// In a monorepo, different packages may resolve to different `drizzle-orm`
// module instances due to hoisting or version mismatches. When tables and
// operators come from different module instances, TypeScript reports type
// incompatibility errors even though the runtime behavior is correct.
//
// By re-exporting operators from the same module that defines the tables,
// we guarantee type compatibility across the workspace.
//
// ## Usage Rule
// **Always import operators from `@package/db-core/schema`**, not directly
// from `drizzle-orm`, when working with `db-core` tables.
//
// @example Correct usage
// ```typescript
// // ✅ Correct: Import operators from the schema package
// import { users, eq, and } from '@package/db-core/schema';
// ```
//
// @example Incorrect usage
// ```typescript
// // ❌ Incorrect: May cause type incompatibility
// import { users } from '@package/db-core/schema';
// import { eq, and } from 'drizzle-orm';
// ```
// ============================================================================

// Comparison operators
export { eq, ne, gt, gte, lt, lte, between, inArray, isNull, isNotNull } from 'drizzle-orm';
// Logical operators
export { and, or, not, exists } from 'drizzle-orm';
// Array operators (PostgreSQL specific)
export { arrayContains, arrayOverlaps } from 'drizzle-orm';
// Sorting operators
export { asc, desc } from 'drizzle-orm';
// Aggregate functions
export { count } from 'drizzle-orm';
// Raw SQL escape hatch
export { sql } from 'drizzle-orm';
// SQL expression type for building dynamic queries
export type { SQL } from 'drizzle-orm';

// ============================================================================
// SECTION 5: DATABASE CONNECTION TYPES
// ============================================================================
// Types for database instances and transactions, enabling type-safe
// dependency injection in repositories.
// ============================================================================

import type { TablesRelationalConfig } from 'drizzle-orm';
import type { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';

/**
 * Drizzle database instance type for node-postgres.
 * Use this when typing a dependency that needs the full database connection.
 */
export type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Drizzle transaction type for node-postgres.
 * Use this when a function specifically requires a transaction context.
 */
export type { NodePgTransaction } from 'drizzle-orm/node-postgres';

/**
 * Union type that accepts either a database connection or a transaction.
 *
 * Use this type in repository methods that should work both standalone
 * and within a transaction context. This enables composable operations
 * where multiple repository calls can be wrapped in a single transaction.
 *
 * @typeParam T - The schema type, defaults to a generic record type.
 *
 * @example Repository method accepting DbType
 * ```typescript
 * import { type DbType, users, eq } from '@package/db-core/schema';
 * import { db } from '@package/db-core';
 *
 * class UserRepository {
 *   // Can be called with db or within a transaction
 *   async findById(dbOrTx: DbType, id: string) {
 *     return dbOrTx.query.users.findFirst({
 *       where: eq(users.id, id)
 *     });
 *   }
 * }
 *
 * // Standalone usage
 * const user = await userRepo.findById(db, '123');
 *
 * // Transaction usage
 * await db.transaction(async (tx) => {
 *   const user = await userRepo.findById(tx, '123');
 *   // ... more operations in same transaction
 * });
 * ```
 *
 * @example Composing repository operations in a transaction
 * ```typescript
 * async function transferOwnership(
 *   userRepo: UserRepository,
 *   orgRepo: OrganizationRepository,
 *   fromUserId: string,
 *   toUserId: string,
 *   orgId: string
 * ) {
 *   await db.transaction(async (tx) => {
 *     // Both operations use the same transaction
 *     await orgRepo.updateOwner(tx, orgId, toUserId);
 *     await userRepo.removeOrgAccess(tx, fromUserId, orgId);
 *   });
 * }
 * ```
 */
export type DbType<T extends Record<string, unknown> = Record<string, unknown>> =
  | NodePgDatabase<T>
  | NodePgTransaction<T, TablesRelationalConfig>;
