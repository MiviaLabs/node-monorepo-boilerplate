/**
 * Repository Interfaces
 *
 * This module exports repository interfaces that define the contract
 * for data access operations. Implementations are provided by the
 * application layer (apps/api) to avoid circular dependencies.
 *
 * @packageDocumentation
 */

export type { IUserRepository, USER_REPOSITORY_TOKEN } from './user-repository.interface';
export type {
  UserEntity,
  UserIdentityEntity,
  UserFilter,
  UserQueryResult,
  UserRepositoryProvider
} from './user-repository.interface';
