/**
 * @module UsersCommands
 * @description CQRS commands for user and user address lifecycle operations.
 */

// User commands
export { CreateUserCommand } from './create-user.command';
export { UpdateUserCommand } from './update-user.command';
export { DeleteUserCommand } from './delete-user.command';

// User address commands
export { CreateUserAddressCommand } from './create-user-address.command';
export { UpdateUserAddressCommand } from './update-user-address.command';
export { DeleteUserAddressCommand } from './delete-user-address.command';

// Key rotation commands (P0: Security-critical operations)
export { RotateAddressKeyCommand } from './rotate-address-key.command';
export { ResumeRotationCommand } from './resume-rotation.command';
export { CancelRotationCommand } from './cancel-rotation.command';
