/**
 * Default timeout for email send operations (milliseconds).
 */
export const DEFAULT_EMAIL_TIMEOUT_MS = 30000;

/**
 * Maximum number of emails in a batch send operation.
 */
export const MAX_BATCH_SIZE = 100;

/**
 * Maximum email subject length (RFC 5322 recommendation).
 */
export const MAX_SUBJECT_LENGTH = 998;

/**
 * Maximum number of recipients per email.
 */
export const MAX_RECIPIENTS_PER_EMAIL = 50;

/**
 * Maximum attachment size in bytes (10 MB).
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Email module injection token.
 */
export const EMAIL_MODULE_OPTIONS = 'EMAIL_MODULE_OPTIONS';

/**
 * Email provider injection token.
 */
export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

/**
 * Default fallback email address used when no default is configured.
 * STYLE-003: Moved from hardcoded value in config-resolver.ts
 */
export const DEFAULT_FALLBACK_EMAIL = 'noreply@example.com';
