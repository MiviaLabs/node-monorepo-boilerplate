/**
 * Centralized OPA policy metadata values used by API controllers.
 *
 * These constants keep resource/action values consistent across route decorators
 * and authorization guard evaluation.
 */

export const OPA_RESOURCES = {
  USERS: 'users',
  USER_ADDRESSES: 'user_addresses',
  ORGANIZATIONS: 'organizations',
  PROJECTS: 'projects',
  CONTENT: 'content',
  CONTENT_COMMENTS: 'content_comments',
  FILES: 'files',
  ISSUES: 'issues',
  TENANTS: 'tenants',
  AUTH_SESSIONS: 'auth_sessions',
  USER_IDENTITIES: 'user_identities',
  INVITATIONS: 'invitations',
  EMAILS: 'emails',
  ENCRYPTED_STORE: 'encrypted_store',
  SYSTEM_MONITOR: 'system_monitor',
  DATA_RETENTION: 'data_retention',
  SYSTEM_SETTINGS: 'system_settings',
  DEAD_LETTER_EVENTS: 'dead_letter_events',
  EVENT_REPLAY: 'event_replay'
} as const;

export const OPA_ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  LIST: 'list',
  WRITE: 'write',
  UPDATE: 'update',
  DELETE: 'delete',
  INVITE: 'invite',
  ACCEPT: 'accept',
  DECLINE: 'decline',
  ASSIGN_ROLE: 'assign_role',
  UPDATE_STATUS: 'update_status',
  GENERATE_LINK: 'generate_link',
  REVOKE: 'revoke',
  LINK: 'link',
  UNLINK: 'unlink',
  READ_ROLES: 'read_roles',
  READ_SELF: 'read_self',
  UPDATE_SELF: 'update_self',
  CHANGE_PASSWORD_SELF: 'change_password_self',
  EXPORT: 'export',
  TRANSFER_OWNERSHIP: 'transfer_ownership',
  SEND: 'send',
  BATCH_SEND: 'batch_send',
  HEALTH_CHECK: 'health_check',
  STORE: 'store',
  RETRIEVE: 'retrieve',
  ROTATE_KEY: 'rotate_key',
  REPLAY: 'replay',
  START: 'start',
  CANCEL: 'cancel'
} as const;

export type OpaResource = (typeof OPA_RESOURCES)[keyof typeof OPA_RESOURCES];
export type OpaAction = (typeof OPA_ACTIONS)[keyof typeof OPA_ACTIONS];
