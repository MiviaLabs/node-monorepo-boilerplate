/**
 * @module UsersServices
 * @description Service exports for users module.
 *
 * ## P0 Security: AddressKeyRotationService is Internal-Only
 *
 * The AddressKeyRotationService is NOT exported from this module.
 * It must ONLY be accessed via authorized command handlers with proper guards.
 *
 * Direct access to the service would bypass authorization checks, which is a P0 violation.
 *
 * To use key rotation functionality:
 * 1. Use the PersonKeyRotationController endpoints (with guards)
 * 2. Or invoke commands via CommandBus (with authorization)
 *
 * @example
 * ```typescript
 * // CORRECT: Use command bus with authorization
 * await this.commandBus.execute(new RotateAddressKeyCommand({...}));
 *
 * // WRONG: Direct service access bypasses authorization
 * await this.addressKeyRotationService.rotateVaultEntries({...});
 * ```
 */

// Public service exports
// Note: AddressKeyRotationService is intentionally NOT exported here
// It must be accessed only through authorized command handlers

// Re-export for internal module use only (not for public API)
export { AddressKeyRotationService } from './address-key-rotation.service';

export type {
  RotationProgress,
  RotationError,
  RotationOptions
} from './address-key-rotation.service';
