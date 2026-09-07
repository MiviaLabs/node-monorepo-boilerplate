/**
 * @module Tenants
 * @description Tenants module for multi-tenancy management, GCP provisioning, and member operations.
 */

export { WorkspacesModule } from './tenants.module';
export { TenantManagementService } from './services/tenant-management.service';
export { TenantService } from './services/tenant.service';
export { GcpTenantRepository } from './repositories/gcp-tenant.repository';
export { ProvisionGcpTenantCommand } from './commands/provision-gcp-tenant.command';
export { GetGcpTenantQuery } from './queries/get-gcp-tenant.query';
export type { GcpTenantConfig, GcpTenantResult, OrganizationWithGcpTenant } from './tenants.types';

// Tenant-scoped CQRS exports
export * from './commands';
export * from './queries';
export * from './events';
export * from './handlers';
export * from './dto';
