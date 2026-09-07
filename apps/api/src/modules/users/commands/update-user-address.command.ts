/**
 * UpdateUserAddressCommand
 *
 * CQRS command for updating an existing user address.
 *
 * Features:
 * - Tenant-scoped command execution
 * - Partial updates supported (only provided fields)
 * - encrypted-store key rotation for updated PII fields
 * - Actor tracking for audit trail
 * - Correlation/causation metadata for distributed tracing
 *
 * @module UsersCommands
 */

import type { AddressType } from '@package/constants';
import type { ICommand } from '@package/types';

/**
 * Address PII components to update
 *
 * All fields are optional. Only provided fields are updated.
 * Updated values are stored as new encrypted-store entries (rotation).
 */
export type AddressComponentUpdates = Partial<{
  /** Street address line 1 */
  readonly street: string;
  /** Street address line 2 (apartment, suite, etc.) */
  readonly street2: string;
  /** City name */
  readonly city: string;
  /** State/province/region */
  readonly state: string;
  /** Postal/ZIP code */
  readonly postalCode: string;
  /** Country code (ISO 3166-1 alpha-2) */
  readonly country: string;
}>;

/**
 * UpdateUserAddressCommand props
 */
export interface UpdateUserAddressCommandProps {
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
   * ID of the address to update.
   */
  readonly addressId: number;

  /**
   * Address components to update
   *
   * Partial address data to update.
   * Only provided fields are updated; others remain unchanged.
   */
  readonly components: AddressComponentUpdates;

  /**
   * New address type (optional)
   *
   * If provided, updates the address type.
   */
  readonly addressType?: AddressType;

  /**
   * Set as default (optional)
   *
   * If provided, updates the default flag.
   * Setting to true makes this the default for its type.
   */
  readonly isDefault?: boolean;

  /**
   * New address label/nickname (optional)
   */
  readonly label?: string;

  /**
   * New country code (ISO 3166-1 alpha-2) (optional)
   */
  readonly countryCode?: string;

  /**
   * Set verified flag (optional)
   *
   * If provided, updates the verification status.
   */
  readonly isVerified?: boolean;

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
 * UpdateUserAddressCommand
 *
 * Command for updating an existing user address.
 *
 * Process:
 * 1. Validate tenant and address ownership
 * 2. For each PII field update:
 *    - Store new value in PII encrypted-store (rotation)
 *    - Update encrypted-store reference in address record
 * 3. Update non-PII fields (type, default, verified)
 * 4. Publish UserAddressUpdated event via outbox
 * 5. Return updated address (without PII)
 *
 * @example
 * ```typescript
 * const command = new UpdateUserAddressCommand({
 *   tenantId: 123,
 *   actorId: 456,
 *   addressId: 789,
 *   components: {
 *     city: 'Los Angeles',
 *     state: 'CA'
 *   },
 *   isDefault: true
 * });
 *
 * const result = await commandBus.execute(command);
 * ```
 */
export class UpdateUserAddressCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId: number;
  readonly addressId: number;
  readonly components: AddressComponentUpdates;
  readonly addressType?: AddressType;
  readonly isDefault?: boolean;
  readonly label?: string;
  readonly countryCode?: string;
  readonly isVerified?: boolean;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: UpdateUserAddressCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.addressId = props.addressId;
    this.components = props.components;
    this.addressType = props.addressType;
    this.isDefault = props.isDefault;
    this.label = props.label;
    this.countryCode = props.countryCode;
    this.isVerified = props.isVerified;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}
