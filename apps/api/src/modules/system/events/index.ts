/**
 * @module SystemEvents
 * @description Domain events for system administration including tenant lifecycle and settings changes.
 */

export { TenantCreatedEvent } from './tenant-created.event';
export { TenantUpdatedEvent } from './tenant-updated.event';
export { TenantDeletedEvent } from './tenant-deleted.event';
export { SettingsUpdatedEvent, type SystemSettingsChanges } from './settings-updated.event';
export * from './system-audit-event';
