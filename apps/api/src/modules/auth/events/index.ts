// Event classes (legacy, kept for backward compatibility)
export { UserRegisteredEvent } from './user-registered.event';
export { UserLoggedInEvent } from './user-logged-in.event';
export { UserLoggedOutEvent } from './user-logged-out.event';
export { IdentityLinkedEvent } from './identity-linked.event';
export { IdentityUnlinkedEvent } from './identity-unlinked.event';
export { TokenRefreshedEvent } from './token-refreshed.event';
export { PasswordResetRequestedEvent } from './password-reset-requested.event';
export { PasswordResetCompletedEvent } from './password-reset-completed.event';

// GDPR/compliance events
export { UserDataExportedEvent } from './user-data-exported.event';

// Event type constants
export * from './auth-event-types.constants';
export * from './auth-audit-event';

// Event data schemas
export type * from './auth-events.schema';
