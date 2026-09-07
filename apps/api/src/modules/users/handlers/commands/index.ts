/**
 * @module UsersCommandHandlers
 * @description CQRS command handlers for user and user address operations.
 */

// User handlers
export { CreateUserHandler } from './create-user.handler';
export { UpdateUserHandler } from './update-user.handler';
export { DeleteUserHandler } from './delete-user.handler';

// User address handlers
export { CreateUserAddressHandler } from './create-user-address.handler';
export { UpdateUserAddressHandler } from './update-user-address.handler';
export { DeleteUserAddressHandler } from './delete-user-address.handler';

// Key rotation handlers (P0: Security-critical operations)
export { RotateAddressKeyHandler } from './rotate-address-key.handler';
export { ResumeRotationHandler } from './resume-rotation.handler';
export { CancelRotationHandler } from './cancel-rotation.handler';
