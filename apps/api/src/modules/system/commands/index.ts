/**
 * @module SystemCommands
 * @description CQRS commands for system administration including tenant and settings management.
 */

export { CreateTenantCommand } from './create-tenant.command';
export { UpdateTenantCommand } from './update-tenant.command';
export { DeleteTenantCommand } from './delete-tenant.command';
export { UpdateSettingsCommand, type SystemSettingsPayload } from './update-settings.command';
