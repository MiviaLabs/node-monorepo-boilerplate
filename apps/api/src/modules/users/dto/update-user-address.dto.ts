import { ApiPropertyOptional } from '@nestjs/swagger';
import { AddressType } from '@package/constants';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
  ValidateNested
} from 'class-validator';

/**
 * Address components DTO
 *
 * Contains sensitive address PII data that will be stored in the encrypted-store.
 * All fields are optional for updates.
 */
class AddressComponentsDto {
  @ApiPropertyOptional({
    description: 'Street address line 1 (e.g., "123 Main St")',
    example: '123 Main St'
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  readonly street?: string;

  @ApiPropertyOptional({
    description: 'Street address line 2 (apartment, suite, unit, etc.)',
    example: 'Apt 4B'
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  readonly street2?: string;

  @ApiPropertyOptional({
    description: 'City name',
    example: 'San Francisco'
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  readonly city?: string;

  @ApiPropertyOptional({
    description: 'State, province, or region',
    example: 'CA'
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  readonly state?: string;

  @ApiPropertyOptional({
    description: 'Postal or ZIP code',
    example: '94105'
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  readonly postalCode?: string;

  @ApiPropertyOptional({
    description: 'Country name (stored in encrypted-store, countryCode stored in DB)',
    example: 'United States'
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  readonly country?: string;
}

/**
 * Update user address DTO
 *
 * Validation DTO for updating an existing user address.
 * All fields are optional - only provided fields will be updated.
 * encrypted-store references will be updated when address components change.
 */
export class UpdateUserAddressDto {
  @ApiPropertyOptional({
    description: 'Address type categorizing the address',
    enum: AddressType,
    example: AddressType.Billing
  })
  @IsEnum(AddressType)
  @IsOptional()
  declare addressType?: AddressType;

  @ApiPropertyOptional({
    description: 'Whether this is the default address for the type',
    example: true
  })
  @IsBoolean()
  @IsOptional()
  declare isDefault?: boolean;

  @ApiPropertyOptional({
    description: 'Address label/nickname (e.g., "Home", "Office", "Vacation House")',
    example: 'Home'
  })
  @IsString()
  @IsOptional()
  @Length(1, 100)
  declare label?: string;

  @ApiPropertyOptional({
    description: 'Country code (ISO 3166-1 alpha-2)',
    example: 'US',
    minLength: 2,
    maxLength: 2
  })
  @IsString()
  @IsOptional()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'Country code must be a valid ISO 3166-1 alpha-2 code (e.g., US, GB, CA)'
  })
  declare countryCode?: string;

  @ApiPropertyOptional({
    description: 'Address PII components (stored encrypted in encrypted-store)',
    type: AddressComponentsDto
  })
  @ValidateNested()
  @Type(() => AddressComponentsDto)
  @IsOptional()
  declare components?: AddressComponentsDto;
}
