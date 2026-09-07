/**
 * @module UsersDtos
 * @description Data transfer objects for user operations including responses, queries, and mutations.
 */

export { UserResponseDto } from './user-response.dto';
export { UserListItemDto } from './user-list-item.dto';
export { QueryUsersDto } from './query-users.dto';
export { CreateUserDto } from './create-user.dto';
export { UpdateUserDto } from './update-user.dto';

// Address DTOs
export { CreateUserAddressDto } from './create-user-address.dto';
export { UpdateUserAddressDto } from './update-user-address.dto';
export { AddressResponseDto } from './address-response.dto';

// Key rotation admin DTOs
export { TriggerKeyRotationDto, TriggerKeyRotationResponseDto } from './trigger-key-rotation.dto';

// Re-export AddressType from constants for convenience
export { AddressType } from '@package/constants';

// Re-export PaginatedResponseDto from common for convenience
export { PaginatedResponseDto } from '@/common/dtos';
