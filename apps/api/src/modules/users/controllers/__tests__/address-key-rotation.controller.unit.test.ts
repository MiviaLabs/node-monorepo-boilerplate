/**
 * Unit Tests for PersonKeyRotationController DTO Validation
 *
 * Tests the RotateAddressKeyDto validation, specifically the custom validator
 * that ensures oldKeyId !== newKeyId.
 */

import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

// Import the DTO from the controller file
// Note: This assumes the DTO is exported. If not, this test validates the controller's validation behavior.
import { RotateAddressKeyDto } from '../address-key-rotation.controller';

describe('RotateAddressKeyDto', () => {
  describe('oldKeyId and newKeyId equality validation', () => {
    it('should fail when oldKeyId and newKeyId are the same', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId: 'key-123',
        newKeyId: 'key-123' // Same as oldKeyId - should fail
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('newKeyId');
      expect(errors[0]?.constraints).toHaveProperty('keyIdsDifferent');
      expect(errors[0]?.constraints?.['keyIdsDifferent']).toBe(
        'oldKeyId and newKeyId must be different'
      );
    });

    it('should pass when oldKeyId and newKeyId are different', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId: 'key-old',
        newKeyId: 'key-new' // Different from oldKeyId - should pass
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should fail when oldKeyId is empty', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId: '',
        newKeyId: 'key-new'
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const oldKeyIdError = errors.find((e) => e.property === 'oldKeyId');
      expect(oldKeyIdError).toBeDefined();
      expect(oldKeyIdError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail when newKeyId is empty', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId: 'key-old',
        newKeyId: ''
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const newKeyIdError = errors.find((e) => e.property === 'newKeyId');
      expect(newKeyIdError).toBeDefined();
      expect(newKeyIdError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail when oldKeyId is not a string', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId: 123, // Not a string
        newKeyId: 'key-new'
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const oldKeyIdError = errors.find((e) => e.property === 'oldKeyId');
      expect(oldKeyIdError).toBeDefined();
      expect(oldKeyIdError?.constraints).toHaveProperty('isString');
    });

    it('should fail when newKeyId is not a string', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId: 'key-old',
        newKeyId: 456 // Not a string
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const newKeyIdError = errors.find((e) => e.property === 'newKeyId');
      expect(newKeyIdError).toBeDefined();
      expect(newKeyIdError?.constraints).toHaveProperty('isString');
    });

    it('should fail when both fields are missing', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {});

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'oldKeyId')).toBe(true);
      expect(errors.some((e) => e.property === 'newKeyId')).toBe(true);
    });

    it('should pass with valid distinct key IDs', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId:
          'projects/my-project/locations/global/keyRings/my-keyring/cryptoKeys/my-key/cryptoKeyVersions/1',
        newKeyId:
          'projects/my-project/locations/global/keyRings/my-keyring/cryptoKeys/my-key/cryptoKeyVersions/2'
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should fail with case-sensitive equality check', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId: 'Key-123',
        newKeyId: 'Key-123' // Same case - should fail
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('newKeyId');
    });

    it('should pass when oldKeyId and newKeyId differ only in case', async () => {
      const dto = plainToClass(RotateAddressKeyDto, {
        oldKeyId: 'key-123',
        newKeyId: 'KEY-123' // Different case - should pass
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });
});
