/**
 * encrypted-store DTO Unit Tests
 *
 * Tests DTO validation using class-validator.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - StoreDataDto validation
 * - RetrieveDataDto validation
 * - RotateKeyDto validation
 * - EncryptedStoreEntryResponseDto.fromEntity()
 * - KeyRotationResponseDto.fromRotation()
 */

import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  StoreDataDto,
  RetrieveDataDto,
  RotateKeyDto,
  EncryptedStoreEntryResponseDto,
  KeyRotationResponseDto
} from '../encrypted-store.dto';

import type { ValidationError } from 'class-validator';

/**
 * Helper function to validate DTO and return errors
 */
async function validateDto<T extends object>(
  DtoClass: new () => T,
  data: Record<string, unknown>
): Promise<ValidationError[]> {
  const instance = plainToInstance(DtoClass, data);
  return validate(instance);
}

describe('StoreDataDto', () => {
  describe('entityType', () => {
    it('should accept valid entity types', async () => {
      const validTypes = ['user', 'organization', 'payment_method', 'document', 'custom'];

      for (const entityType of validTypes) {
        const errors = await validateDto(StoreDataDto, {
          entityType,
          entityId: 123,
          fieldPath: 'email',
          data: 'test@example.com'
        });

        const entityTypeErrors = errors.filter((e) => e.property === 'entityType');
        expect(entityTypeErrors).toHaveLength(0);
      }
    });

    it('should reject invalid entity type', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'invalid_type',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com'
      });

      const entityTypeErrors = errors.filter((e) => e.property === 'entityType');
      expect(entityTypeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('entityId', () => {
    it('should accept valid number', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com'
      });

      const entityIdErrors = errors.filter((e) => e.property === 'entityId');
      expect(entityIdErrors).toHaveLength(0);
    });

    it('should reject non-numeric value', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 'not-a-number',
        fieldPath: 'email',
        data: 'test@example.com'
      });

      const entityIdErrors = errors.filter((e) => e.property === 'entityId');
      expect(entityIdErrors.length).toBeGreaterThan(0);
    });
  });

  describe('fieldPath', () => {
    it('should accept valid field path', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'profile.email',
        data: 'test@example.com'
      });

      const fieldPathErrors = errors.filter((e) => e.property === 'fieldPath');
      expect(fieldPathErrors).toHaveLength(0);
    });

    it('should reject empty field path', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: '',
        data: 'test@example.com'
      });

      const fieldPathErrors = errors.filter((e) => e.property === 'fieldPath');
      expect(fieldPathErrors.length).toBeGreaterThan(0);
    });

    it('should reject field path exceeding 255 characters', async () => {
      const longFieldPath = 'a'.repeat(256);
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: longFieldPath,
        data: 'test@example.com'
      });

      const fieldPathErrors = errors.filter((e) => e.property === 'fieldPath');
      expect(fieldPathErrors.length).toBeGreaterThan(0);
    });

    it('should accept field path at max length', async () => {
      const maxFieldPath = 'a'.repeat(255);
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: maxFieldPath,
        data: 'test@example.com'
      });

      const fieldPathErrors = errors.filter((e) => e.property === 'fieldPath');
      expect(fieldPathErrors).toHaveLength(0);
    });
  });

  describe('data', () => {
    it('should accept valid string data', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com'
      });

      const dataErrors = errors.filter((e) => e.property === 'data');
      expect(dataErrors).toHaveLength(0);
    });

    it('should reject empty data', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: ''
      });

      const dataErrors = errors.filter((e) => e.property === 'data');
      expect(dataErrors.length).toBeGreaterThan(0);
    });
  });

  describe('classification (optional)', () => {
    it('should accept valid classification values', async () => {
      const validClassifications = ['public', 'internal', 'confidential', 'restricted'];

      for (const classification of validClassifications) {
        const errors = await validateDto(StoreDataDto, {
          entityType: 'user',
          entityId: 123,
          fieldPath: 'email',
          data: 'test@example.com',
          classification
        });

        const classificationErrors = errors.filter((e) => e.property === 'classification');
        expect(classificationErrors).toHaveLength(0);
      }
    });

    it('should reject invalid classification', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com',
        classification: 'invalid'
      });

      const classificationErrors = errors.filter((e) => e.property === 'classification');
      expect(classificationErrors.length).toBeGreaterThan(0);
    });

    it('should allow missing classification', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com'
        // classification not provided
      });

      const classificationErrors = errors.filter((e) => e.property === 'classification');
      expect(classificationErrors).toHaveLength(0);
    });
  });

  describe('category (optional)', () => {
    it('should accept valid category values', async () => {
      const validCategories = ['none', 'personal', 'sensitive', 'health', 'biometric'];

      for (const category of validCategories) {
        const errors = await validateDto(StoreDataDto, {
          entityType: 'user',
          entityId: 123,
          fieldPath: 'email',
          data: 'test@example.com',
          category
        });

        const categoryErrors = errors.filter((e) => e.property === 'category');
        expect(categoryErrors).toHaveLength(0);
      }
    });

    it('should reject invalid category', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com',
        category: 'invalid'
      });

      const categoryErrors = errors.filter((e) => e.property === 'category');
      expect(categoryErrors.length).toBeGreaterThan(0);
    });

    it('should allow missing category', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com'
        // category not provided
      });

      const categoryErrors = errors.filter((e) => e.property === 'category');
      expect(categoryErrors).toHaveLength(0);
    });
  });

  describe('expiresAt (optional)', () => {
    it('should accept valid ISO date string', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com',
        expiresAt: '2025-12-31T23:59:59.999Z'
      });

      const expiresAtErrors = errors.filter((e) => e.property === 'expiresAt');
      expect(expiresAtErrors).toHaveLength(0);
    });

    it('should reject invalid date format', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com',
        expiresAt: 'not-a-date'
      });

      const expiresAtErrors = errors.filter((e) => e.property === 'expiresAt');
      expect(expiresAtErrors.length).toBeGreaterThan(0);
    });

    it('should allow missing expiresAt', async () => {
      const errors = await validateDto(StoreDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        data: 'test@example.com'
        // expiresAt not provided
      });

      const expiresAtErrors = errors.filter((e) => e.property === 'expiresAt');
      expect(expiresAtErrors).toHaveLength(0);
    });
  });
});

describe('RetrieveDataDto', () => {
  describe('entityType', () => {
    it('should accept valid entity types', async () => {
      const errors = await validateDto(RetrieveDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email'
      });

      const entityTypeErrors = errors.filter((e) => e.property === 'entityType');
      expect(entityTypeErrors).toHaveLength(0);
    });

    it('should reject invalid entity type', async () => {
      const errors = await validateDto(RetrieveDataDto, {
        entityType: 'invalid_type',
        entityId: 123,
        fieldPath: 'email'
      });

      const entityTypeErrors = errors.filter((e) => e.property === 'entityType');
      expect(entityTypeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('accessReason (optional)', () => {
    it('should accept valid access reason', async () => {
      const errors = await validateDto(RetrieveDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        accessReason: 'User profile update'
      });

      const accessReasonErrors = errors.filter((e) => e.property === 'accessReason');
      expect(accessReasonErrors).toHaveLength(0);
    });

    it('should reject access reason exceeding 500 characters', async () => {
      const longReason = 'a'.repeat(501);
      const errors = await validateDto(RetrieveDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email',
        accessReason: longReason
      });

      const accessReasonErrors = errors.filter((e) => e.property === 'accessReason');
      expect(accessReasonErrors.length).toBeGreaterThan(0);
    });

    it('should allow missing access reason', async () => {
      const errors = await validateDto(RetrieveDataDto, {
        entityType: 'user',
        entityId: 123,
        fieldPath: 'email'
        // accessReason not provided
      });

      const accessReasonErrors = errors.filter((e) => e.property === 'accessReason');
      expect(accessReasonErrors).toHaveLength(0);
    });
  });
});

describe('RotateKeyDto', () => {
  const validBase = {
    oldKeyId:
      'projects/my-project/locations/us-central1/keyRings/ring/cryptoKeys/key/cryptoKeyVersions/1',
    newKeyId:
      'projects/my-project/locations/us-central1/keyRings/ring/cryptoKeys/key/cryptoKeyVersions/2'
  };

  it('should accept valid oldKeyId and newKeyId', async () => {
    const errors = await validateDto(RotateKeyDto, validBase);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing oldKeyId', async () => {
    const { newKeyId } = validBase;
    const errors = await validateDto(RotateKeyDto, { newKeyId });
    const fieldErrors = errors.filter((e) => e.property === 'oldKeyId');
    expect(fieldErrors.length).toBeGreaterThan(0);
  });

  it('should reject missing newKeyId', async () => {
    const { oldKeyId } = validBase;
    const errors = await validateDto(RotateKeyDto, { oldKeyId });
    const fieldErrors = errors.filter((e) => e.property === 'newKeyId');
    expect(fieldErrors.length).toBeGreaterThan(0);
  });

  it('should accept valid rotationReason', async () => {
    const errors = await validateDto(RotateKeyDto, {
      ...validBase,
      rotationReason: 'Scheduled quarterly rotation'
    });

    const rotationReasonErrors = errors.filter((e) => e.property === 'rotationReason');
    expect(rotationReasonErrors).toHaveLength(0);
  });

  it('should reject rotationReason exceeding 500 characters', async () => {
    const longReason = 'a'.repeat(501);
    const errors = await validateDto(RotateKeyDto, {
      ...validBase,
      rotationReason: longReason
    });

    const rotationReasonErrors = errors.filter((e) => e.property === 'rotationReason');
    expect(rotationReasonErrors.length).toBeGreaterThan(0);
  });
});

describe('EncryptedStoreEntryResponseDto', () => {
  describe('fromEntity', () => {
    it('should create response DTO from entity', () => {
      // Arrange
      const entity = {
        id: 1,
        organizationId: 123,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        keyId: 'primary-encryption-key',
        classification: 'confidential',
        category: 'pii',
        accessLog: [{ timestamp: '2025-01-01T12:00:00.000Z', accessedBy: 1, action: 'stored' }],
        createdAt: new Date('2025-01-01T12:00:00.000Z'),
        updatedAt: new Date('2025-01-01T12:00:00.000Z'),
        rotatedAt: null
      };

      // Act
      const result = EncryptedStoreEntryResponseDto.fromEntity(entity);

      // Assert
      expect(result.id).toBe(entity.id);
      expect(result.organizationId).toBe(entity.organizationId);
      expect(result.entityType).toBe(entity.entityType);
      expect(result.entityId).toBe(entity.entityId);
      expect(result.fieldPath).toBe(entity.fieldPath);
      expect(result.keyId).toBe(entity.keyId);
      expect(result.classification).toBe(entity.classification);
      expect(result.category).toBe(entity.category);
      expect(result.accessCount).toBe(1);
      expect(result.createdAt).toEqual(entity.createdAt);
      expect(result.rotatedAt).toBeNull();
    });

    it('should calculate access count from access log', () => {
      // Arrange
      const entity = {
        id: 1,
        organizationId: 123,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        keyId: 'primary-encryption-key',
        classification: 'confidential',
        category: 'pii',
        accessLog: [
          { timestamp: '2025-01-01T12:00:00.000Z', accessedBy: 1, action: 'stored' },
          { timestamp: '2025-01-01T13:00:00.000Z', accessedBy: 2, action: 'retrieved' },
          { timestamp: '2025-01-01T14:00:00.000Z', accessedBy: 3, action: 'retrieved' }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        rotatedAt: null
      };

      // Act
      const result = EncryptedStoreEntryResponseDto.fromEntity(entity);

      // Assert
      expect(result.accessCount).toBe(3);
    });

    it('should handle null access log', () => {
      // Arrange
      const entity = {
        id: 1,
        organizationId: 123,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        keyId: 'primary-encryption-key',
        classification: 'confidential',
        category: 'pii',
        accessLog: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        rotatedAt: null
      };

      // Act
      const result = EncryptedStoreEntryResponseDto.fromEntity(entity);

      // Assert
      expect(result.accessCount).toBe(0);
      expect(result.lastAccessedAt).toBeNull();
    });

    it('should extract last accessed timestamp', () => {
      // Arrange
      const lastTimestamp = '2025-01-01T14:00:00.000Z';
      const entity = {
        id: 1,
        organizationId: 123,
        entityType: 'user',
        entityId: 789,
        fieldPath: 'email',
        keyId: 'primary-encryption-key',
        classification: 'confidential',
        category: 'pii',
        accessLog: [
          { timestamp: '2025-01-01T12:00:00.000Z', accessedBy: 1, action: 'stored' },
          { timestamp: lastTimestamp, accessedBy: 2, action: 'retrieved' }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        rotatedAt: null
      };

      // Act
      const result = EncryptedStoreEntryResponseDto.fromEntity(entity);

      // Assert
      expect(result.lastAccessedAt).toEqual(new Date(lastTimestamp));
    });
  });
});

describe('KeyRotationResponseDto', () => {
  describe('fromRotation', () => {
    it('should create response DTO from rotation data', () => {
      // Arrange
      const rotationData = {
        organizationId: 123,
        entriesRotated: 42,
        previousKeyId: 'primary-encryption-key',
        newKeyId: 'tenant-123-rotated-1234567890',
        rotatedAt: new Date('2025-01-01T12:00:00.000Z'),
        rotationReason: 'Scheduled quarterly rotation'
      };

      // Act
      const result = KeyRotationResponseDto.fromRotation(rotationData);

      // Assert
      expect(result.organizationId).toBe(rotationData.organizationId);
      expect(result.entriesRotated).toBe(rotationData.entriesRotated);
      expect(result.previousKeyId).toBe(rotationData.previousKeyId);
      expect(result.newKeyId).toBe(rotationData.newKeyId);
      expect(result.rotatedAt).toEqual(rotationData.rotatedAt);
      expect(result.rotationReason).toBe(rotationData.rotationReason);
    });

    it('should handle missing rotation reason', () => {
      // Arrange
      const rotationData = {
        organizationId: 123,
        entriesRotated: 42,
        previousKeyId: 'primary-encryption-key',
        newKeyId: 'tenant-123-rotated-1234567890',
        rotatedAt: new Date()
        // rotationReason not provided
      };

      // Act
      const result = KeyRotationResponseDto.fromRotation(rotationData);

      // Assert
      expect(result.rotationReason).toBeUndefined();
    });
  });
});
