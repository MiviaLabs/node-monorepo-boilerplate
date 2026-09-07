/**
 * Tests for postal code validation schemas
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  usZipCodeSchema,
  caPostalCodeSchema,
  ukPostalCodeSchema,
  genericPostalCodeSchema
} from './postal-code.validator';

describe('postal-code.validator', () => {
  // eslint-disable-next-line max-lines-per-function
  describe('usZipCodeSchema', () => {
    it('should accept valid US ZIP codes (5 digits)', () => {
      const validZipCodes = ['12345', '90210', '10001', '60601'];

      for (const zip of validZipCodes) {
        const result = usZipCodeSchema.safeParse(zip);
        assert.strictEqual(result.success, true, `Should accept: ${zip}`);
        if (result.success) {
          assert.strictEqual(result.data, zip);
        }
      }
    });

    it('should accept valid US ZIP codes (5+4 format)', () => {
      const validZipCodes = ['12345-6789', '90210-1234', '10001-0001'];

      for (const zip of validZipCodes) {
        const result = usZipCodeSchema.safeParse(zip);
        assert.strictEqual(result.success, true, `Should accept: ${zip}`);
        if (result.success) {
          assert.strictEqual(result.data, zip);
        }
      }
    });

    it('should reject ZIP codes with less than 5 digits', () => {
      const invalidZipCodes = ['1234', '123', '12'];

      for (const zip of invalidZipCodes) {
        const result = usZipCodeSchema.safeParse(zip);
        assert.strictEqual(result.success, false, `Should reject: ${zip}`);
      }
    });

    it('should reject ZIP codes with more than 5 digits without dash', () => {
      const result = usZipCodeSchema.safeParse('123456');
      assert.strictEqual(result.success, false);
    });

    it('should reject ZIP codes with invalid dash format', () => {
      const invalidFormats = ['12345-', '-6789', '1234-5678', '123456-789'];

      for (const zip of invalidFormats) {
        const result = usZipCodeSchema.safeParse(zip);
        assert.strictEqual(result.success, false, `Should reject: ${zip}`);
      }
    });

    it('should reject ZIP codes with letters', () => {
      const result = usZipCodeSchema.safeParse('1234A');
      assert.strictEqual(result.success, false);
    });

    it('should reject non-string values', () => {
      assert.strictEqual(usZipCodeSchema.safeParse(12345).success, false);
      assert.strictEqual(usZipCodeSchema.safeParse(null).success, false);
      assert.strictEqual(usZipCodeSchema.safeParse(undefined).success, false);
    });
  });

  describe('caPostalCodeSchema', () => {
    it('should accept valid Canadian postal codes (A1A 1A1 format)', () => {
      const validPostalCodes = ['K1A0B1', 'M5V3L8', 'T2X1V4', 'V6C1G8', 'H3B1R9'];

      for (const code of validPostalCodes) {
        const result = caPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, true, `Should accept: ${code}`);
        if (result.success) {
          assert.strictEqual(result.data, code);
        }
      }
    });

    it('should accept valid Canadian postal codes (A1A-1A1 format)', () => {
      const validPostalCodes = ['K1A-0B1', 'M5V-3L8', 'T2X-1V4'];

      for (const code of validPostalCodes) {
        const result = caPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, true, `Should accept: ${code}`);
      }
    });

    it('should accept valid Canadian postal codes (A1A1A1 format)', () => {
      const validPostalCodes = ['K1A0B1', 'M5V3L8', 'T2X1V4'];

      for (const code of validPostalCodes) {
        const result = caPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, true, `Should accept: ${code}`);
      }
    });

    it('should reject postal codes with invalid format', () => {
      const invalidCodes = [
        '123456', // All numbers
        'ABCDEF', // All letters
        'A1A 1A', // Too short
        'K1A 0B11', // Too long
        '1A1A1A' // Starts with number
      ];

      for (const code of invalidCodes) {
        const result = caPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, false, `Should reject: ${code}`);
      }
    });

    it('should reject non-string values', () => {
      assert.strictEqual(caPostalCodeSchema.safeParse(123456).success, false);
      assert.strictEqual(caPostalCodeSchema.safeParse(null).success, false);
    });

    it('should be case insensitive', () => {
      const result1 = caPostalCodeSchema.safeParse('k1a0b1');
      const result2 = caPostalCodeSchema.safeParse('K1A0B1');
      assert.strictEqual(result1.success, true);
      assert.strictEqual(result2.success, true);
    });
  });

  describe('ukPostalCodeSchema', () => {
    it('should accept valid UK postal codes', () => {
      const validPostalCodes = [
        'SW1A 1AA',
        'M1 1AA',
        'B33 8TH',
        'CR2 6XH',
        'DN55 1PT',
        'W1A 0AX',
        'EC1A 1BB',
        'M1 1AE',
        'B33 8TH',
        'CF10 1BH'
      ];

      for (const code of validPostalCodes) {
        const result = ukPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, true, `Should accept: ${code}`);
        if (result.success) {
          assert.strictEqual(result.data, code);
        }
      }
    });

    it('should accept UK postal codes without space', () => {
      const validPostalCodes = ['SW1A1AA', 'M11AA', 'B338TH'];

      for (const code of validPostalCodes) {
        const result = ukPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, true, `Should accept: ${code}`);
      }
    });

    it('should reject invalid UK postal codes', () => {
      const invalidCodes = [
        '12345',
        'ABC123',
        'SW1A', // Too short
        'SW1A 1AAA', // Too long
        '12A 1AA' // Starts with number
      ];

      for (const code of invalidCodes) {
        const result = ukPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, false, `Should reject: ${code}`);
      }
    });

    it('should reject non-string values', () => {
      assert.strictEqual(ukPostalCodeSchema.safeParse(12345).success, false);
      assert.strictEqual(ukPostalCodeSchema.safeParse(null).success, false);
    });

    it('should be case insensitive', () => {
      const result1 = ukPostalCodeSchema.safeParse('sw1a 1aa');
      const result2 = ukPostalCodeSchema.safeParse('SW1A 1AA');
      assert.strictEqual(result1.success, true);
      assert.strictEqual(result2.success, true);
    });
  });

  describe('genericPostalCodeSchema', () => {
    it('should accept valid generic postal codes', () => {
      const validPostalCodes = ['12345', 'ABC-123', 'A1B 2C3', '12345-6789', 'SW1A 1AA', 'K1A-0B1'];

      for (const code of validPostalCodes) {
        const result = genericPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, true, `Should accept: ${code}`);
        if (result.success) {
          assert.strictEqual(result.data, code);
        }
      }
    });

    it('should accept postal codes at minimum length (3 characters)', () => {
      const result = genericPostalCodeSchema.safeParse('A1B');
      assert.strictEqual(result.success, true);
    });

    it('should accept postal codes at maximum length (10 characters)', () => {
      const result = genericPostalCodeSchema.safeParse('12345-6789');
      assert.strictEqual(result.success, true);
    });

    it('should reject postal codes shorter than 3 characters', () => {
      const shortCodes = ['A1', '12', 'A'];

      for (const code of shortCodes) {
        const result = genericPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, false, `Should reject: ${code}`);
      }
    });

    it('should reject postal codes longer than 10 characters', () => {
      const result = genericPostalCodeSchema.safeParse('12345-67890');
      assert.strictEqual(result.success, false);
    });

    it('should reject postal codes with invalid characters', () => {
      const invalidCodes = ['A1B@C3', '123.456', 'A1B#C3'];

      for (const code of invalidCodes) {
        const result = genericPostalCodeSchema.safeParse(code);
        assert.strictEqual(result.success, false, `Should reject: ${code}`);
      }
    });

    it('should reject non-string values', () => {
      assert.strictEqual(genericPostalCodeSchema.safeParse(12345).success, false);
      assert.strictEqual(genericPostalCodeSchema.safeParse(null).success, false);
      assert.strictEqual(genericPostalCodeSchema.safeParse(undefined).success, false);
    });
  });
});
