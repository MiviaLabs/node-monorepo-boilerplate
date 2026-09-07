import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

import { CurrentUserSettingsResponseDto } from './current-user-settings.dto';
import { UserOrganizationDto } from './user-organization.dto';
import { UserProfileResponseDto } from './user-profile-response.dto';

export class AuthBootstrapResponseDto {
  @ApiProperty({ type: () => UserProfileResponseDto })
  @ValidateNested()
  @Type(() => UserProfileResponseDto)
  declare user: UserProfileResponseDto;

  @ApiProperty({ type: () => UserOrganizationDto, isArray: true })
  @ValidateNested({ each: true })
  @Type(() => UserOrganizationDto)
  declare organizations: UserOrganizationDto[];

  @ApiProperty({
    description: 'Selected organization ID for the current authenticated workspace context.',
    example: '123',
    nullable: true
  })
  @IsOptional()
  @IsString()
  declare currentOrganizationId: string | null;

  @ApiProperty({ type: () => CurrentUserSettingsResponseDto })
  @ValidateNested()
  @Type(() => CurrentUserSettingsResponseDto)
  declare currentUserSettings: CurrentUserSettingsResponseDto;

  @ApiProperty({
    description: 'Resolved tenant name for the current authenticated workspace context.',
    example: 'Acme Corp',
    nullable: true
  })
  @IsOptional()
  @IsString()
  declare tenantName: string | null;

  @ApiProperty({
    description: 'Resolved tenant display name for the current authenticated workspace context.',
    example: 'Acme',
    nullable: true
  })
  @IsOptional()
  @IsString()
  declare tenantDisplayName: string | null;

  @ApiProperty({
    description: 'Resolved tenant slug for the current authenticated workspace context.',
    example: 'acme-corp',
    nullable: true
  })
  @IsOptional()
  @IsString()
  declare tenantSlug: string | null;
}
