import { ApiProperty } from '@nestjs/swagger';
import { AddressType } from '@package/constants';

import type { UserAddress } from '@package/db-core';
interface AddressComponentsDto {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

type UserAddressWithComponents = UserAddress & {
  decrypted?: AddressComponentsDto;
};

/**
 * Address response DTO
 *
 * Returns user address details and optional decrypted components for authorized reads.
 * encrypted-store references are also included for audit and traceability.
 */
export class AddressResponseDto {
  @ApiProperty({
    description: 'Address ID',
    example: 1
  })
  declare id: number;

  @ApiProperty({
    description: 'Organization ID (tenant)',
    example: 1
  })
  declare organizationId: number;

  @ApiProperty({
    description: 'User ID who owns this address',
    example: 1
  })
  declare userId: number;

  @ApiProperty({
    description: 'Address type categorizing the address',
    enum: AddressType,
    example: AddressType.Primary
  })
  declare addressType: AddressType;

  @ApiProperty({
    description: 'Address label/nickname',
    example: 'Home',
    required: false
  })
  declare label: string | null;

  @ApiProperty({
    description: 'encrypted-store entry ID for encrypted street address',
    example: 1,
    required: false
  })
  declare streetEncryptedStoreId: number | null;

  @ApiProperty({
    description: 'encrypted-store entry ID for encrypted street address line 2',
    example: 2,
    required: false
  })
  declare street2EncryptedStoreId: number | null;

  @ApiProperty({
    description: 'encrypted-store entry ID for encrypted city',
    example: 3,
    required: false
  })
  declare cityEncryptedStoreId: number | null;

  @ApiProperty({
    description: 'encrypted-store entry ID for encrypted state/province',
    example: 4,
    required: false
  })
  declare stateEncryptedStoreId: number | null;

  @ApiProperty({
    description: 'encrypted-store entry ID for encrypted postal code',
    example: 5,
    required: false
  })
  declare postalCodeEncryptedStoreId: number | null;

  @ApiProperty({
    description: 'encrypted-store entry ID for encrypted country name',
    example: 6,
    required: false
  })
  declare countryEncryptedStoreId: number | null;

  @ApiProperty({
    description: 'Country code (ISO 3166-1 alpha-2)',
    example: 'US',
    required: false
  })
  declare countryCode: string | null;

  @ApiProperty({
    description: 'Whether this is the default address for the type',
    example: true
  })
  declare isDefault: boolean;

  @ApiProperty({
    description: 'Whether the address has been verified',
    example: false
  })
  declare isVerified: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-01T00:00:00.000Z'
  })
  declare createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-01T00:00:00.000Z'
  })
  declare updatedAt: Date;

  @ApiProperty({
    description: 'Decrypted address components for authorized address reads',
    required: false
  })
  declare components?: AddressComponentsDto;

  /**
   * Create from database entity
   *
   * Maps the UserAddress entity to ResponseDto, excluding internal fields.
   * Note: deletedAt is intentionally excluded from responses.
   *
   * @param address - Database entity
   * @returns Response DTO
   */
  static fromEntity(address: UserAddressWithComponents): AddressResponseDto {
    const dto = new AddressResponseDto();
    dto.id = address.id;
    dto.organizationId = address.organizationId;
    dto.userId = address.userId;
    dto.addressType = address.addressType as AddressType;
    dto.label = address.label;
    dto.streetEncryptedStoreId = address.streetEncryptedStoreId;
    dto.street2EncryptedStoreId = address.street2EncryptedStoreId;
    dto.cityEncryptedStoreId = address.cityEncryptedStoreId;
    dto.stateEncryptedStoreId = address.stateEncryptedStoreId;
    dto.postalCodeEncryptedStoreId = address.postalCodeEncryptedStoreId;
    dto.countryEncryptedStoreId = address.countryEncryptedStoreId;
    dto.countryCode = address.countryCode;
    dto.isDefault = address.isDefault;
    dto.isVerified = address.isVerified;
    dto.createdAt = address.createdAt;
    dto.updatedAt = address.updatedAt;
    dto.components = address.decrypted;
    return dto;
  }

  /**
   * Create array from database entities
   *
   * Maps multiple UserAddress entities to ResponseDtos.
   *
   * @param addresses - Database entities
   * @returns Response DTOs
   */
  static fromEntities(addresses: UserAddressWithComponents[]): AddressResponseDto[] {
    return addresses.map((address) => AddressResponseDto.fromEntity(address));
  }
}
