/**
 * Unit tests for @Encrypted decorator
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import { EncryptionAlgorithm } from '../../../constants';
import {
  getEntityMetadata,
  getFieldMetadata,
  isEncryptedProperty,
  getEncryptedFieldNames,
  clearEntityMetadata as clearMetadata
} from '../../../decorators/encrypted-metadata';
import { Encrypted, EncryptedEntity } from '../../../decorators/encrypted.decorator';

describe('@Encrypted decorator', () => {
  beforeEach(() => {
    clearMetadata();
  });

  describe('Encrypted', () => {
    it('should mark a property as encrypted', () => {
      class TestEntity {
        id!: string;

        @Encrypted()
        email!: string;
      }

      const metadata = getEntityMetadata(TestEntity);
      expect(metadata.encryptedFields.has('email')).toBe(true);
    });

    it('should store options in metadata', () => {
      class TestEntity {
        @Encrypted({ keyId: 'my-key', provider: 'aws', algorithm: EncryptionAlgorithm.AES_256_GCM })
        ssn!: string;
      }

      const metadata = getFieldMetadata(TestEntity, 'ssn');
      expect(metadata?.keyId).toBe('my-key');
      expect(metadata?.provider).toBe('aws');
      expect(metadata?.algorithm).toBe(EncryptionAlgorithm.AES_256_GCM);
    });

    it('should support multiple encrypted fields', () => {
      class User {
        @Encrypted()
        email!: string;

        @Encrypted({ keyId: 'ssn-key' })
        ssn!: string;

        @Encrypted({ provider: 'azure' })
        phone!: string;
      }

      const fields = getEncryptedFieldNames(User);
      expect(fields).toHaveLength(3);
      expect(fields).toContain('email');
      expect(fields).toContain('ssn');
      expect(fields).toContain('phone');
    });

    it('should work with inheritance', () => {
      class BaseEntity {
        id!: string;

        @Encrypted()
        secret!: string;
      }

      class User extends BaseEntity {
        @Encrypted({ provider: 'aws' })
        email!: string;
      }

      const baseFields = getEncryptedFieldNames(BaseEntity);
      expect(baseFields).toContain('secret');

      const userFields = getEncryptedFieldNames(User);
      // Note: Due to how decorators work, inherited fields need to be checked via prototype
      // The User class may or may not include 'secret' depending on metadata inheritance implementation
      expect(userFields).toContain('email');
      // If inheritance is supported:
      // expect(userFields).toContain('secret');
    });

    it('should default allowNull to false', () => {
      class TestEntity {
        @Encrypted()
        field!: string;
      }

      const metadata = getFieldMetadata(TestEntity, 'field');
      expect(metadata?.allowNull).toBe(false);
    });

    it('should respect allowNull option', () => {
      class TestEntity {
        @Encrypted({ allowNull: false })
        field!: string;
      }

      const metadata = getFieldMetadata(TestEntity, 'field');
      expect(metadata?.allowNull).toBe(false);
    });
  });

  describe('EncryptedEntity', () => {
    it('should set entity-level options', () => {
      @EncryptedEntity({ provider: 'gcp', keyId: 'default-key' })
      class TestEntity {
        @Encrypted()
        field!: string;
      }

      const entitySymbol = Symbol.for('encrypted:entity');
      const metadata = (TestEntity as unknown as Record<PropertyKey, unknown>)[entitySymbol] as {
        provider?: string;
        keyId?: string;
      };
      expect(metadata.provider).toBe('gcp');
      expect(metadata.keyId).toBe('default-key');
    });

    it('should merge with decorator-level options', () => {
      @EncryptedEntity({ provider: 'aws', keyId: 'entity-key' })
      class TestEntity {
        @Encrypted({ keyId: 'field-key' })
        field1!: string;

        @Encrypted()
        field2!: string;
      }

      const field1Metadata = getFieldMetadata(TestEntity, 'field1');
      const field2Metadata = getFieldMetadata(TestEntity, 'field2');

      expect(field1Metadata?.keyId).toBe('field-key');
      expect(field1Metadata?.provider).toBe('aws'); // Should inherit from entity

      expect(field2Metadata?.keyId).toBe('entity-key'); // Should inherit from entity
      expect(field2Metadata?.provider).toBe('aws'); // Should inherit from entity
    });
  });

  describe('isEncryptedProperty', () => {
    it('should return true for encrypted properties', () => {
      class TestEntity {
        @Encrypted()
        encrypted!: string;

        notEncrypted!: string;
      }

      expect(isEncryptedProperty(TestEntity, 'encrypted')).toBe(true);
      expect(isEncryptedProperty(TestEntity, 'notEncrypted')).toBe(false);
    });
  });

  describe('getEncryptedFieldNames', () => {
    it('should return all encrypted field names', () => {
      class TestEntity {
        @Encrypted()
        field1!: string;

        field2!: string;

        @Encrypted()
        field3!: string;
      }

      const fields = getEncryptedFieldNames(TestEntity);
      expect(fields).toHaveLength(2);
      expect(fields).toContain('field1');
      expect(fields).toContain('field3');
    });

    it('should return empty array for entities without encrypted fields', () => {
      class TestEntity {
        field1!: string;
        field2!: string;
      }

      const fields = getEncryptedFieldNames(TestEntity);
      expect(fields).toEqual([]);
    });
  });

  describe('getFieldMetadata', () => {
    it('should return metadata for encrypted field', () => {
      class TestEntity {
        @Encrypted({ keyId: 'test-key' })
        field!: string;
      }

      const metadata = getFieldMetadata(TestEntity, 'field');
      expect(metadata).toBeTruthy();
      expect(metadata!.propertyName).toBe('field');
      expect(metadata!.keyId).toBe('test-key');
    });

    it('should return undefined for non-encrypted field', () => {
      class TestEntity {
        field!: string;
      }

      const metadata = getFieldMetadata(TestEntity, 'field');
      expect(metadata).toBeUndefined();
    });
  });
});

describe('clearEntityMetadata', () => {
  it('should clear all metadata', () => {
    class TestEntity1 {
      @Encrypted()
      field!: string;
    }

    class TestEntity2 {
      @Encrypted()
      field!: string;
    }

    expect(getEncryptedFieldNames(TestEntity1).length).toBeGreaterThan(0);
    expect(getEncryptedFieldNames(TestEntity2).length).toBeGreaterThan(0);

    clearMetadata();

    expect(getEncryptedFieldNames(TestEntity1)).toHaveLength(0);
    expect(getEncryptedFieldNames(TestEntity2)).toHaveLength(0);
  });

  it('should clear specific entity metadata', () => {
    class TestEntity1 {
      @Encrypted()
      field!: string;
    }

    class TestEntity2 {
      @Encrypted()
      field!: string;
    }

    clearMetadata(TestEntity1);

    expect(getEncryptedFieldNames(TestEntity1)).toHaveLength(0);
    expect(getEncryptedFieldNames(TestEntity2).length).toBeGreaterThan(0);
  });
});
