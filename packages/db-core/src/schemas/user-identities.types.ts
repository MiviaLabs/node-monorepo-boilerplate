/**
 * User Identity Types
 *
 * Type definitions for user authentication identities across multiple providers.
 * This file exports the core types for use in other packages.
 */

import type { userIdentities, IdentityProvider } from './user-identities.schema';

// Export the inferred types from the schema
export type UserIdentity = typeof userIdentities.$inferSelect;
export type NewUserIdentity = typeof userIdentities.$inferInsert;

// Export the enum for type-safe provider references
export type { IdentityProvider };

/**
 * Helper type for provider-specific operations
 */
export type ProviderIdentity = Pick<UserIdentity, 'id' | 'provider' | 'providerUid'>;

/**
 * Helper type for identity verification status
 */
export type IdentityVerification = Pick<UserIdentity, 'emailVerified' | 'phoneVerified'>;

/**
 * Helper type for primary identity operations
 */
export type PrimaryIdentity = UserIdentity & { isPrimary: true };
