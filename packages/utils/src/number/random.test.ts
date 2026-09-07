/**
 * Tests for number/random.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { randomInt, randomFloat, randomUUID } from './random.js';

describe('number/random', () => {
  describe('randomInt', () => {
    it('should generate random integer within range inclusive', () => {
      const min = 1;
      const max = 10;
      for (let i = 0; i < 100; i++) {
        const result = randomInt(min, max);
        assert.strictEqual(result >= min && result <= max && Number.isInteger(result), true);
      }
    });

    it('should handle min equals max', () => {
      const result = randomInt(5, 5);
      assert.strictEqual(result, 5);
    });

    it('should handle negative ranges', () => {
      const min = -10;
      const max = -1;
      for (let i = 0; i < 100; i++) {
        const result = randomInt(min, max);
        assert.strictEqual(result >= min && result <= max && Number.isInteger(result), true);
      }
    });

    it('should handle ranges crossing zero', () => {
      const min = -5;
      const max = 5;
      for (let i = 0; i < 100; i++) {
        const result = randomInt(min, max);
        assert.strictEqual(result >= min && result <= max && Number.isInteger(result), true);
      }
    });

    it('should handle zero', () => {
      assert.strictEqual(randomInt(0, 0), 0);
    });

    it('should handle large ranges', () => {
      const min = 0;
      const max = 10000;
      const result = randomInt(min, max);
      assert.strictEqual(result >= min && result <= max, true);
    });

    it('should handle reverse min/max (min > max)', () => {
      // Implementation assumes min < max, so this tests behavior
      const result = randomInt(10, 1);
      // Will generate values, but may be outside expected range
      assert.strictEqual(Number.isInteger(result), true);
    });
  });

  describe('randomFloat', () => {
    it('should generate random float within range inclusive of min, exclusive of max', () => {
      const min = 0;
      const max = 1;
      for (let i = 0; i < 100; i++) {
        const result = randomFloat(min, max);
        assert.strictEqual(result >= min && result < max, true);
      }
    });

    it('should handle min equals max', () => {
      const result = randomFloat(5, 5);
      assert.strictEqual(result, 5);
    });

    it('should handle negative ranges', () => {
      const min = -1.5;
      const max = -0.5;
      for (let i = 0; i < 100; i++) {
        const result = randomFloat(min, max);
        assert.strictEqual(result >= min && result < max, true);
      }
    });

    it('should handle ranges crossing zero', () => {
      const min = -1;
      const max = 1;
      for (let i = 0; i < 100; i++) {
        const result = randomFloat(min, max);
        assert.strictEqual(result >= min && result < max, true);
      }
    });

    it('should generate decimal values', () => {
      const min = 0;
      const max = 10;
      let hasDecimal = false;
      for (let i = 0; i < 100; i++) {
        const result = randomFloat(min, max);
        if (!Number.isInteger(result)) {
          hasDecimal = true;
        }
        assert.strictEqual(result >= min && result < max, true);
      }
      assert.strictEqual(hasDecimal, true);
    });

    it('should handle large ranges', () => {
      const min = 0;
      const max = 10000;
      const result = randomFloat(min, max);
      assert.strictEqual(result >= min && result < max, true);
    });
  });

  describe('randomUUID', () => {
    it('should generate valid UUID v4 format', () => {
      const uuid = randomUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.strictEqual(uuidRegex.test(uuid), true);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        uuids.add(randomUUID());
      }
      assert.strictEqual(uuids.size, 1000);
    });

    it('should generate UUIDs with correct length', () => {
      const uuid = randomUUID();
      assert.strictEqual(uuid.length, 36);
    });

    it('should have hyphens in correct positions', () => {
      const uuid = randomUUID();
      assert.strictEqual(uuid[8], '-');
      assert.strictEqual(uuid[13], '-');
      assert.strictEqual(uuid[18], '-');
      assert.strictEqual(uuid[23], '-');
    });

    it('should have version 4 identifier', () => {
      const uuid = randomUUID();
      assert.strictEqual(uuid[14], '4');
    });

    it('should have valid variant bits', () => {
      const uuid = randomUUID();
      const variantChar = uuid[19]?.toLowerCase() ?? '';
      assert.strictEqual(
        variantChar === '8' || variantChar === '9' || variantChar === 'a' || variantChar === 'b',
        true
      );
    });

    it('should contain only hexadecimal characters and hyphens', () => {
      const uuid = randomUUID();
      const validChars = /^[0-9a-f-]+$/i;
      assert.strictEqual(validChars.test(uuid), true);
    });
  });
});
