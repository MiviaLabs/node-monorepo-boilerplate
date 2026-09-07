/**
 * @module UsersQueries
 * @description CQRS queries for retrieving user data including single user, paginated listings, and address queries.
 */

export { GetUserQuery } from './get-user.query';
export { ListUsersQuery } from './list-users.query';
export { GetUserAddressQuery } from './get-user-address.query';
export { GetUserAddressesQuery } from './get-user-addresses.query';
export { GetDefaultAddressQuery } from './get-default-address.query';
export type { ListUsersQueryProps } from './list-users.query';
export type { GetUserAddressQueryProps } from './get-user-address.query';
export type { GetUserAddressesQueryProps } from './get-user-addresses.query';
export type { GetDefaultAddressQueryProps } from './get-default-address.query';
