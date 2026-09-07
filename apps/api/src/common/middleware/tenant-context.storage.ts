import { AsyncLocalStorage } from 'node:async_hooks';

import type { TenantType } from '@package/db-core';

/**
 * Tenant context interface
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantType?: TenantType;
  readonly userId?: string;
  readonly userRoles?: readonly string[];
}

/**
 * Async local storage for tenant context
 * Each request gets its own isolated storage
 */
const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Set tenant context for current request.
 *
 * @param context - The tenant context to set
 */
export function setTenantContext(context: TenantContext): void {
  const store = tenantStorage.getStore();
  if (store) {
    Object.assign(store, context);
  }
}

/**
 * Get tenant context from current request.
 *
 * @returns The tenant context or undefined if not set
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

/**
 * Get tenant ID from current request.
 *
 * @returns The tenant ID string
 * @throws Error if tenant context is not set
 */
export function getTenantId(): string {
  const context = getTenantContext();
  if (!context?.tenantId) {
    throw new Error('Tenant context not found');
  }
  return context.tenantId;
}

/**
 * Run callback with tenant context.
 *
 * @param context - The tenant context to use
 * @param callback - The callback function to execute
 * @returns The result of the callback function
 */
export function runWithTenantContext<T>(context: TenantContext, callback: () => T): T {
  return tenantStorage.run(context, callback);
}

/**
 * Clear tenant context for current request.
 * This ensures no context leaks between requests in test environments.
 *
 * @returns void
 */
export function clearTenantContext(): void {
  tenantStorage.disable();
}

/**
 * Export storage for use in middleware
 */
export { tenantStorage };
