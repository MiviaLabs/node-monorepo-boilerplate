/**
 * CreateUserAddressCommand
 *
 * CQRS command for creating a new user address with encrypted-store-backed PII storage.
 *
 * Features:
 * - Tenant-scoped command execution
 * - Actor tracking for audit trail
 * - Correlation/causation metadata for distributed tracing
 * - Address components stored in PII encrypted-store (Class-C data)
 *
 * @module UsersCommands
 */

import type { AddressType } from '@package/constants';
import type { ICommand } from '@package/types';

/**
 * Address PII components to store in encrypted-store
 *
 * All fields are optional but at least one must be provided.
 * Values are stored encrypted in the PII encrypted-store.
 */
export interface AddressComponents {
  /** Street address line 1 */
  readonly street?: string;
  /** Street address line 2 (apartment, suite, etc.) */
  readonly street2?: string;
  /** City name */
  readonly city?: string;
  /** State/province/region */
  readonly state?: string;
  /** Postal/ZIP code */
  readonly postalCode?: string;
  /** Country code (ISO 3166-1 alpha-2) */
  readonly country?: string;
}

/**
 * CreateUserAddressCommand props
 */
export interface CreateUserAddressCommandProps {
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
   * User ID
   *
   * ID of the user who owns this address.
   */
  readonly userId: number;

  /**
   * Address type
   *
   * Categorizes the address (primary, billing, shipping, etc.)
   */
  readonly addressType: AddressType;

  /**
   * Whether this is the default address
   *
   * If true, this becomes the user's default address for the type.
   * Only one address per type can be default.
   */
  readonly isDefault?: boolean;

  /**
   * Address label/nickname (optional)
   *
   * Examples: "Home", "Office", "Vacation House"
   */
  readonly label?: string;

  /**
   * Country code (ISO 3166-1 alpha-2) (optional)
   */
  readonly countryCode?: string;

  /**
   * Address PII components
   *
   * Sensitive address data stored in the PII encrypted-store.
   * At least one component must be provided.
   */
  readonly components: AddressComponents;

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
 * CreateUserAddressCommand
 *
 * Command for creating a new user address with encrypted-store-backed PII storage.
 *
 * Process:
 * 1. Validate tenant and user ownership
 * 2. Store address components in PII encrypted-store
 * 3. Create address record with encrypted-store references
 * 4. Publish UserAddressCreated event via outbox
 * 5. Return created address (without PII)
 *
 * @example
 * ```typescript
 * const command = new CreateUserAddressCommand({
 *   tenantId: 123,
 *   actorId: 456,
 *   userId: 789,
 *   addressType: AddressType.Primary,
 *   isDefault: true,
 *   components: {
 *     street: '123 Main St',
 *     city: 'San Francisco',
 *     state: 'CA',
 *     postalCode: '94105',
 *     country: 'US'
 *   }
 * });
 *
 * const result = await commandBus.execute(command);
 * ```
 */
export class CreateUserAddressCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId: number;
  readonly userId: number;
  readonly addressType: AddressType;
  readonly isDefault: boolean;
  readonly label?: string;
  readonly countryCode?: string;
  readonly components: AddressComponents;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: CreateUserAddressCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.userId = props.userId;
    this.addressType = props.addressType;
    this.isDefault = props.isDefault ?? false;
    this.label = props.label;
    this.countryCode = props.countryCode;
    this.components = props.components;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}
