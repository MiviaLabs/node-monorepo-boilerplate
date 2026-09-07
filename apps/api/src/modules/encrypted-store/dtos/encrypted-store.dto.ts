import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';

import type { DataClassification, DataCategory } from '@package/types';

/**
 * Store Data DTO
 *
 * Request DTO for storing encrypted PII data in the vault.
 * Note: This accepts plaintext data which will be encrypted by the service.
 */
export class StoreDataDto {
  @ApiProperty({
    description: 'Entity type (e.g., user, organization, payment_method)',
    example: 'user',
    enum: ['user', 'organization', 'payment_method', 'document', 'custom']
  })
  @IsEnum(['user', 'organization', 'payment_method', 'document', 'custom'], {
    message: 'Entity type must be one of: user, organization, payment_method, document, custom'
  })
  declare entityType: string;

  @ApiProperty({
    description: 'Entity ID (the ID of the entity this data belongs to)',
    example: 123
  })
  @IsNumber({}, { message: 'Entity ID must be a number' })
  declare entityId: number;

  @ApiProperty({
    description: 'Field path within the entity (e.g., "email", "ssn", "phone")',
    example: 'email',
    minLength: 1,
    maxLength: 255
  })
  @IsString()
  @MinLength(1, { message: 'Field path is required' })
  @MaxLength(255, { message: 'Field path must not exceed 255 characters' })
  declare fieldPath: string;

  @ApiProperty({
    description: 'Plaintext data to be encrypted and stored in the vault',
    example: 'john.doe@example.com'
  })
  @IsString()
  @MinLength(1, { message: 'Data is required' })
  declare data: string;

  @ApiPropertyOptional({
    description: 'Data classification level (auto-classified if not provided)',
    example: 'confidential',
    enum: ['public', 'internal', 'confidential', 'restricted']
  })
  @IsOptional()
  @IsEnum(['public', 'internal', 'confidential', 'restricted'], {
    message: 'Classification must be one of: public, internal, confidential, restricted'
  })
  declare classification?: DataClassification;

  @ApiPropertyOptional({
    description: 'Data category for compliance reporting',
    example: 'pii',
    enum: ['none', 'personal', 'sensitive', 'health', 'biometric']
  })
  @IsOptional()
  @IsEnum(['none', 'personal', 'sensitive', 'health', 'biometric'], {
    message: 'Category must be one of: none, personal, sensitive, health, biometric'
  })
  declare category?: DataCategory;

  @ApiPropertyOptional({
    description: 'Expiration date for the data (ISO 8601 format)',
    example: '2025-12-31T23:59:59.999Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Expiration date must be a valid ISO 8601 date string' })
  declare expiresAt?: string | null;

  @ApiPropertyOptional({
    description: 'Additional metadata (JSON object)',
    example: '{"purpose":"account_recovery","source":"user_input"}'
  })
  @IsOptional()
  declare metadata?: Record<string, unknown> | null;
}

/**
 * Retrieve Data DTO
 *
 * Request DTO for retrieving encrypted PII data from the vault.
 */
export class RetrieveDataDto {
  @ApiProperty({
    description: 'Entity type (e.g., user, organization, payment_method)',
    example: 'user',
    enum: ['user', 'organization', 'payment_method', 'document', 'custom']
  })
  @IsEnum(['user', 'organization', 'payment_method', 'document', 'custom'], {
    message: 'Entity type must be one of: user, organization, payment_method, document, custom'
  })
  declare entityType: string;

  @ApiProperty({
    description: 'Entity ID (the ID of the entity this data belongs to)',
    example: 123
  })
  @IsNumber({}, { message: 'Entity ID must be a number' })
  declare entityId: number;

  @ApiProperty({
    description: 'Field path within the entity (e.g., "email", "ssn", "phone")',
    example: 'email',
    minLength: 1,
    maxLength: 255
  })
  @IsString()
  @MinLength(1, { message: 'Field path is required' })
  @MaxLength(255, { message: 'Field path must not exceed 255 characters' })
  declare fieldPath: string;

  @ApiPropertyOptional({
    description: 'Access reason for audit trail',
    example: 'User profile update'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Access reason must not exceed 500 characters' })
  declare accessReason?: string;
}

/**
 * Rotate Key DTO
 *
 * Request DTO for rotating encryption keys for a tenant.
 * Requires explicit key IDs so re-encryption is deterministic and idempotent.
 */
export class RotateKeyDto {
  @ApiProperty({
    description: 'Old key identifier to rotate away from (identifier only, never key material)',
    example: 'tenant-42-v1'
  })
  @IsString()
  @MinLength(1, { message: 'oldKeyId is required' })
  declare oldKeyId: string;

  @ApiProperty({
    description: 'New key identifier to rotate to (identifier only, never key material)',
    example: 'tenant-42-v2'
  })
  @IsString()
  @MinLength(1, { message: 'newKeyId is required' })
  declare newKeyId: string;

  @ApiPropertyOptional({
    description: 'Reason for key rotation',
    example: 'Scheduled quarterly rotation'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  declare rotationReason?: string;
}

/**
 * Vault Entry Response DTO
 *
 * Response DTO for vault entry operations.
 */
export class EncryptedStoreEntryResponseDto {
  @ApiProperty({ description: 'Vault entry ID' })
  declare id: number;

  @ApiProperty({ description: 'Organization ID (tenant)' })
  declare organizationId: number;

  @ApiProperty({ description: 'Entity type' })
  declare entityType: string;

  @ApiProperty({ description: 'Entity ID' })
  declare entityId: number;

  @ApiProperty({ description: 'Field path' })
  declare fieldPath: string;

  @ApiProperty({ description: 'Key ID used for encryption' })
  declare keyId: string;

  @ApiProperty({ description: 'Data classification level' })
  declare classification: string;

  @ApiProperty({ description: 'Data category' })
  declare category: string;

  @ApiProperty({ description: 'Number of times accessed' })
  declare accessCount: number;

  @ApiProperty({ description: 'Last accessed timestamp' })
  declare lastAccessedAt: Date | null;

  @ApiProperty({ description: 'Creation timestamp' })
  declare createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  declare updatedAt: Date | null;

  @ApiProperty({ description: 'Key rotation timestamp', nullable: true })
  declare rotatedAt: Date | null;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  declare metadata?: Record<string, unknown> | null;

  /**
   * Create response DTO from vault entry entity
   */
  static fromEntity(
    entry: {
      id: number;
      organizationId: number;
      entityType: string;
      entityId: number;
      fieldPath: string;
      keyId: string;
      classification: string;
      category: string;
      accessLog: Array<{ timestamp: string; accessedBy: number; action: string }> | null;
      createdAt: Date;
      updatedAt: Date;
      rotatedAt: Date | null;
    } & Partial<{ metadata: Record<string, unknown> }>
  ): EncryptedStoreEntryResponseDto {
    const dto = new EncryptedStoreEntryResponseDto();
    dto.id = entry.id;
    dto.organizationId = entry.organizationId;
    dto.entityType = entry.entityType;
    dto.entityId = entry.entityId;
    dto.fieldPath = entry.fieldPath;
    dto.keyId = entry.keyId;
    dto.classification = entry.classification;
    dto.category = entry.category;
    dto.accessCount = entry.accessLog?.length ?? 0;
    const lastAccessLogEntry = entry.accessLog?.[entry.accessLog.length - 1];
    dto.lastAccessedAt = lastAccessLogEntry ? new Date(lastAccessLogEntry.timestamp) : null;
    dto.createdAt = entry.createdAt;
    dto.updatedAt = entry.updatedAt;
    dto.rotatedAt = entry.rotatedAt;
    dto.metadata = entry.metadata;
    return dto;
  }
}

/**
 * Key Rotation Response DTO
 *
 * Response DTO for key rotation operations.
 */
export class KeyRotationResponseDto {
  @ApiProperty({ description: 'Organization ID (tenant)' })
  declare organizationId: number;

  @ApiProperty({ description: 'Entries rotated' })
  declare entriesRotated: number;

  @ApiProperty({ description: 'Previous key ID' })
  declare previousKeyId: string;

  @ApiProperty({ description: 'New key ID' })
  declare newKeyId: string;

  @ApiProperty({ description: 'Rotation timestamp' })
  declare rotatedAt: Date;

  @ApiPropertyOptional({ description: 'Rotation reason' })
  declare rotationReason?: string;

  /**
   * Create response DTO from rotation data
   */
  static fromRotation(data: {
    organizationId: number;
    entriesRotated: number;
    previousKeyId: string;
    newKeyId: string;
    rotatedAt: Date;
    rotationReason?: string;
  }): KeyRotationResponseDto {
    const dto = new KeyRotationResponseDto();
    dto.organizationId = data.organizationId;
    dto.entriesRotated = data.entriesRotated;
    dto.previousKeyId = data.previousKeyId;
    dto.newKeyId = data.newKeyId;
    dto.rotatedAt = data.rotatedAt;
    dto.rotationReason = data.rotationReason;
    return dto;
  }
}
