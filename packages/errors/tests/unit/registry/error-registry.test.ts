/**
 * Unit tests for Error Registry
 *
 * Tests the ERROR_REGISTRY constant and helper functions.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  ERROR_REGISTRY,
  getErrorDefinition,
  isErrorCode,
  getErrorCodesByType,
  validateErrorParameters,
  ErrorType
} from '../../../src/registry/error-registry';

describe('Error Registry', () => {
  describe('ERROR_REGISTRY', () => {
    it('should be a frozen object', () => {
      // Object.freeze doesn't throw in non-strict mode, so we check if it's frozen
      assert.ok(Object.isFrozen(ERROR_REGISTRY));
    });

    it('should contain error codes from all 8 domains', () => {
      const domains = ['USER_', 'AUTH_', 'VAL_', 'DB_', 'BIZ_', 'EXT_', 'FILE_', 'SYS_'];

      for (const domain of domains) {
        const codes = Object.keys(ERROR_REGISTRY).filter((code) => code.startsWith(domain));
        assert.ok(codes.length > 0, `Domain ${domain} should have errors`);
      }
    });

    it('should have at least 50 error codes', () => {
      const count = Object.keys(ERROR_REGISTRY).length;
      assert.ok(count >= 50, `Expected at least 50 errors, got ${count}`);
    });
  });

  describe('getErrorDefinition', () => {
    it('should return error definition for valid code', () => {
      const def = getErrorDefinition('USER_001');
      assert.ok(def);
      assert.equal(def?.code, 'USER_001');
      assert.equal(def?.type, ErrorType.USER);
    });

    it('should return undefined for invalid code', () => {
      const def = getErrorDefinition('INVALID_001');
      assert.equal(def, undefined);
    });
  });

  describe('isErrorCode', () => {
    it('should return true for valid error codes', () => {
      assert.equal(isErrorCode('USER_001'), true);
      assert.equal(isErrorCode('AUTH_001'), true);
    });

    it('should return false for invalid error codes', () => {
      assert.equal(isErrorCode('INVALID_001'), false);
      assert.equal(isErrorCode('NOT_A_CODE'), false);
    });
  });

  describe('getErrorCodesByType', () => {
    it('should return all user error codes', () => {
      const codes = getErrorCodesByType(ErrorType.USER);
      assert.ok(codes.length > 0);
      assert.ok(codes.every((code) => code.startsWith('USER_')));
    });

    it('should return all auth error codes', () => {
      const codes = getErrorCodesByType(ErrorType.AUTH);
      assert.ok(codes.length > 0);
      assert.ok(codes.every((code) => code.startsWith('AUTH_')));
    });
  });

  describe('validateErrorParameters', () => {
    it('should pass validation for valid required parameters', () => {
      const result = validateErrorParameters('USER_001', { userId: '123' });
      assert.equal(result.valid, true);
      assert.equal(result.missing.length, 0);
      assert.equal(result.invalid.length, 0);
    });

    it('should fail validation for missing required parameters', () => {
      const result = validateErrorParameters('USER_001', {});
      assert.equal(result.valid, false);
      assert.ok(result.missing.includes('userId'));
    });

    it('should fail validation for invalid parameter types', () => {
      const result = validateErrorParameters('USER_001', { userId: 123 });
      assert.equal(result.valid, false);
      assert.ok(result.invalid.length > 0);
    });

    it('should pass validation for errors with no parameters', () => {
      const result = validateErrorParameters('AUTH_001', {});
      assert.equal(result.valid, true);
    });

    it('should handle optional parameters correctly', () => {
      const result1 = validateErrorParameters('USER_007', {});
      assert.equal(result1.valid, true);

      const result2 = validateErrorParameters('USER_007', { reason: 'Spam' });
      assert.equal(result2.valid, true);
    });
  });

  describe('Error definitions structure', () => {
    it('should have all required properties for each error', () => {
      for (const [code, definition] of Object.entries(ERROR_REGISTRY)) {
        assert.ok(definition.code, `${code} should have code property`);
        assert.ok(definition.type, `${code} should have type property`);
        assert.ok(definition.severity, `${code} should have severity property`);
        assert.ok(definition.httpStatus, `${code} should have httpStatus property`);
        assert.ok(definition.message, `${code} should have message property`);
        assert.ok(
          typeof definition.safeForUser === 'boolean',
          `${code} should have safeForUser property`
        );
      }
    });

    it('should have unique error codes', () => {
      const codes = Object.keys(ERROR_REGISTRY);
      const uniqueCodes = new Set(codes);
      assert.equal(codes.length, uniqueCodes.size, 'All error codes should be unique');
    });

    it('should have valid HTTP status codes (400-599)', () => {
      for (const definition of Object.values(ERROR_REGISTRY)) {
        assert.ok(
          definition.httpStatus >= 400 && definition.httpStatus < 600,
          `${definition.code} has invalid HTTP status: ${definition.httpStatus}`
        );
      }
    });
  });
});
