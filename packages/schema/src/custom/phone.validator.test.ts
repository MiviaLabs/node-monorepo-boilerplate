/**
 * Tests for phone number validation schemas
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  phoneNumberSchema,
  usPhoneNumberSchema,
  flexiblePhoneNumberSchema
} from './phone.validator';

describe('phone.validator', () => {
  describe('phoneNumberSchema (E.164)', () => {
    it('should accept valid E.164 phone numbers', () => {
      const validPhoneNumbers = [
        '+14155552671',
        '+442071234567',
        '+33612345678',
        '+911234567890',
        '+123456789012345' // 15 digits after country code (max)
      ];

      for (const phone of validPhoneNumbers) {
        const result = phoneNumberSchema.safeParse(phone);
        assert.strictEqual(result.success, true, `Should accept: ${phone}`);
        if (result.success) {
          assert.strictEqual(result.data, phone);
        }
      }
    });

    it('should reject phone numbers without + prefix', () => {
      const invalidPhoneNumbers = ['14155552671', '442071234567', '1234567890'];

      for (const phone of invalidPhoneNumbers) {
        const result = phoneNumberSchema.safeParse(phone);
        assert.strictEqual(result.success, false, `Should reject: ${phone}`);
      }
    });

    it('should reject phone numbers starting with +0', () => {
      const result = phoneNumberSchema.safeParse('+0123456789');
      assert.strictEqual(result.success, false);
    });

    it('should reject phone numbers with invalid characters', () => {
      const invalidPhoneNumbers = [
        '+1 (415) 555-2671',
        '+1-415-555-2671',
        '+1 415 555 2671',
        '+44-20-7123-4567'
      ];

      for (const phone of invalidPhoneNumbers) {
        const result = phoneNumberSchema.safeParse(phone);
        assert.strictEqual(result.success, false, `Should reject: ${phone}`);
      }
    });

    it('should reject phone numbers that are too long', () => {
      const tooLong = '+1234567890123456'; // 16 digits after +
      const result = phoneNumberSchema.safeParse(tooLong);
      assert.strictEqual(result.success, false);
    });

    it('should reject non-string values', () => {
      assert.strictEqual(phoneNumberSchema.safeParse(1234567890).success, false);
      assert.strictEqual(phoneNumberSchema.safeParse(null).success, false);
      assert.strictEqual(phoneNumberSchema.safeParse(undefined).success, false);
    });

    it('should reject empty strings', () => {
      const result = phoneNumberSchema.safeParse('');
      assert.strictEqual(result.success, false);
    });
  });

  describe('usPhoneNumberSchema', () => {
    it('should accept valid US phone numbers in E.164 format', () => {
      const validPhoneNumbers = ['+14155552671', '+12125551234', '+13105559876', '+14151234567'];

      for (const phone of validPhoneNumbers) {
        const result = usPhoneNumberSchema.safeParse(phone);
        assert.strictEqual(result.success, true, `Should accept: ${phone}`);
        if (result.success) {
          assert.strictEqual(result.data, phone);
        }
      }
    });

    it('should reject phone numbers with wrong country code', () => {
      const invalidPhoneNumbers = [
        '+442071234567', // UK
        '+33612345678', // France
        '+911234567890' // India
      ];

      for (const phone of invalidPhoneNumbers) {
        const result = usPhoneNumberSchema.safeParse(phone);
        assert.strictEqual(result.success, false, `Should reject: ${phone}`);
      }
    });

    it('should reject phone numbers with too few digits', () => {
      const result = usPhoneNumberSchema.safeParse('+1123456789');
      assert.strictEqual(result.success, false);
    });

    it('should reject phone numbers with too many digits', () => {
      const result = usPhoneNumberSchema.safeParse('+141555526712');
      assert.strictEqual(result.success, false);
    });

    it('should reject formatted phone numbers', () => {
      const formattedNumbers = [
        '+1 (415) 555-2671',
        '+1-415-555-2671',
        '(415) 555-2671',
        '415-555-2671'
      ];

      for (const phone of formattedNumbers) {
        const result = usPhoneNumberSchema.safeParse(phone);
        assert.strictEqual(result.success, false, `Should reject: ${phone}`);
      }
    });

    it('should reject non-string values', () => {
      assert.strictEqual(usPhoneNumberSchema.safeParse(14155552671).success, false);
      assert.strictEqual(usPhoneNumberSchema.safeParse(null).success, false);
    });
  });

  describe('flexiblePhoneNumberSchema', () => {
    it('should accept various phone number formats', () => {
      const validPhoneNumbers = [
        '+1 (415) 555-2671',
        '+1-415-555-2671',
        '+1 415 555 2671',
        '(415) 555-2671',
        '415-555-2671',
        '415 555 2671',
        '4155552671',
        '+44 20 7123 4567'
      ];

      for (const phone of validPhoneNumbers) {
        const result = flexiblePhoneNumberSchema.safeParse(phone);
        assert.strictEqual(result.success, true, `Should accept: ${phone}`);
      }
    });

    it('should transform phone numbers by removing formatting', () => {
      const testCases = [
        { input: '+1 (415) 555-2671', expected: '+14155552671' },
        { input: '(415) 555-2671', expected: '4155552671' },
        { input: '415-555-2671', expected: '4155552671' },
        { input: '415 555 2671', expected: '4155552671' }
      ];

      for (const { input, expected } of testCases) {
        const result = flexiblePhoneNumberSchema.safeParse(input);
        assert.strictEqual(result.success, true, `Should accept: ${input}`);
        if (result.success) {
          assert.strictEqual(result.data, expected, `Should transform "${input}" to "${expected}"`);
        }
      }
    });

    it('should reject phone numbers with invalid characters', () => {
      const invalidPhoneNumbers = [
        '415-555-2671a',
        '415-555-2671!',
        '415.555.2671',
        '415@555@2671'
      ];

      for (const phone of invalidPhoneNumbers) {
        const result = flexiblePhoneNumberSchema.safeParse(phone);
        assert.strictEqual(result.success, false, `Should reject: ${phone}`);
      }
    });

    it('should reject empty strings', () => {
      const result = flexiblePhoneNumberSchema.safeParse('');
      assert.strictEqual(result.success, false);
    });

    it('should reject non-string values', () => {
      assert.strictEqual(flexiblePhoneNumberSchema.safeParse(4155552671).success, false);
      assert.strictEqual(flexiblePhoneNumberSchema.safeParse(null).success, false);
      assert.strictEqual(flexiblePhoneNumberSchema.safeParse(undefined).success, false);
    });
  });
});
