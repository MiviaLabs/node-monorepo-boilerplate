/**
 * @module Users
 * @description Users module for managing user entities with CQRS patterns and multi-tenancy support.
 */

export { PeopleModule } from './users.module';

// Controllers
export { PeopleController } from './controllers/users.controller';
export { PersonAddressesController } from './controllers/user-addresses.controller';

// Repositories
export { UserRepository, CachedUserRepository, UserAddressRepository } from './repositories';
export type { CreateUserData, UpdateUserData } from './repositories';

// Commands
export { CreateUserCommand, UpdateUserCommand, DeleteUserCommand } from './commands';
export {
  CreateUserAddressCommand,
  UpdateUserAddressCommand,
  DeleteUserAddressCommand
} from './commands';

// Queries
export {
  GetUserQuery,
  ListUsersQuery,
  GetUserAddressesQuery,
  GetDefaultAddressQuery
} from './queries';
export type {
  ListUsersQueryProps,
  GetUserAddressesQueryProps,
  GetDefaultAddressQueryProps
} from './queries';

// DTOs
export {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UserListItemDto,
  QueryUsersDto
} from './dto';
export { CreateUserAddressDto, UpdateUserAddressDto } from './dto';
export type { AddressResponseDto } from './dto';

// Constants
export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, USER_ENTITY_NAME } from './users.constants';

// Services
export { AddressKeyRotationService } from './services';
