/**
 * DeleteUserAddressCommand
 *
 * CQRS command for deleting a user address.
 *
 * Features:
 * - Tenant-scoped command execution
 * - Soft delete with audit trail
 * - Actor tracking for audit logging
 * - Correlation/causation metadata for distributed tracing
 *
 * @module UsersCommands
 */

import type { ICommand } from '@package/types';

/**
 * DeleteUserAddressCommand props
 */
export interface DeleteUserAddressCommandProps {
  /**
   * Tenant/organization ID
   *
   * Required for multi-tenant isolation.
   * All database operations are scoped to this tenant.
   */
  readonly tenantId: number;

  /**
   * Actor ID
   *
   * ID of the user performing this action.
   * Used for audit logging and authorization.
   */
  readonly actorId: number;

  /**
   * Address ID
   *
   * ID of the address to delete.
   */
  readonly addressId: number;

  /**
   * Request ID
   *
   * Optional inbound request identifier propagated from the HTTP boundary.
   */
  readonly requestId?: string;

  /**
   * Correlation ID
   *
   * Optional ID for distributed tracing.
   * Links multiple operations in a transactional workflow.
   */
  readonly correlationId?: string;

  /**
   * Causation ID
   *
   * Optional ID identifying the command/message that caused this command.
   * Used for tracking command chain ancestry.
   */
  readonly causationId?: string;
}

/**
 * DeleteUserAddressCommand
 *
 * Command for deleting a user address.
 *
 * Process:
 * 1. Validate tenant and address ownership
 * 2. Perform soft delete (set deletedAt, clear isDefault)
 * 3. Publish UserAddressDeleted event via outbox
 * 4. Return success confirmation
 *
 * Note: This is a soft delete. The address record and encrypted-store entries
 * are retained for audit purposes. Hard deletion is a separate
 * administrative operation.
 *
 * @example
 * ```typescript
 * const command = new DeleteUserAddressCommand({
 *   tenantId: 123,
 *   actorId: 456,
 *   addressId: 789
 * });
 *
 * const result = await commandBus.execute(command);
 * ```
 */
export class DeleteUserAddressCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId: number;
  readonly addressId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: DeleteUserAddressCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.addressId = props.addressId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}
