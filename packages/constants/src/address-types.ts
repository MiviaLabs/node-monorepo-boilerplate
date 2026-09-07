/**
 * @package/constants
 *
 * Address type constants for user addresses.
 *
 * These constants define the types of addresses users can store,
 * such as primary residence, billing, shipping, and office addresses.
 */

/**
 * Address type enum
 *
 * Type-safe address type values for categorizing user addresses.
 * Used in DTOs, commands, and events throughout the application.
 *
 * @example
 * ```typescript
 * import { AddressType } from '@package/constants';
 *
 * const addressType = AddressType.Primary;
 * ```
 */
export enum AddressType {
  /** Primary residential address */
  Primary = 'primary',
  /** Billing address for payments */
  Billing = 'billing',
  /** Shipping address for deliveries */
  Shipping = 'shipping',
  /** Office/business address */
  Office = 'office'
}
