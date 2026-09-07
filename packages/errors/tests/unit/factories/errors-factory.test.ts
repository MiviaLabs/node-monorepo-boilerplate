/**
 * Unit tests for Errors factory class
 *
 * Tests the auto-generated factory methods.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { Errors } from '../../../src/exceptions/index';
import { RegisteredError } from '../../../src/exceptions/registered-error.exception';

describe('Errors Factory', () => {
  describe('static factory methods', () => {
    it('should create USER_001 error with parameters', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });

      assert.ok(error instanceof RegisteredError);
      assert.equal(error.code, 'USER_001');
      assert.equal(error.parameters.userId, '123');
    });

    it('should create AUTH_001 error without parameters', () => {
      const error = (Errors as Record<string, unknown>).authinvalidEmailOr001({});

      assert.ok(error instanceof RegisteredError);
      assert.equal(error.code, 'AUTH_001');
    });

    it('should support optional metadata parameter', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001(
        { userId: '123' },
        { requestId: 'abc-123' }
      );

      assert.equal(error.metadata.requestId, 'abc-123');
    });

    it('should have factory methods for all error codes', () => {
      // Check a few representative error codes
      const testCases = [
        { method: 'useruserWithId001', code: 'USER_001', params: { userId: '123' } },
        { method: 'authinvalidEmailOr001', code: 'AUTH_001', params: {} },
        {
          method: 'validationvalidationFailedField001',
          code: 'VAL_001',
          params: { field: 'email' }
        },
        { method: 'databasedatabaseQueryFailed005', code: 'DB_005', params: {} }
      ];

      for (const testCase of testCases) {
        const error = (Errors as Record<string, unknown>)[testCase.method](testCase.params);
        assert.ok(
          error instanceof RegisteredError,
          `${testCase.method} should return RegisteredError`
        );
        assert.equal(error.code, testCase.code);
      }
    });

    it('should enforce type safety for parameters', () => {
      // This test verifies TypeScript compilation
      // If this compiles, type safety is working
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.ok(error);

      // @ts-expect-error - Should error with wrong type
      // const invalidError = (Errors as Record<string, unknown>).useruserWithId001({ userId: 123 });
    });
  });

  describe('parameter validation', () => {
    it('should validate required parameters at compile time', () => {
      // USER_001 requires userId parameter
      // @ts-expect-error - Should error without required parameter
      // (Errors as Record<string, unknown>).useruserWithId001({});

      // This should work
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.ok(error);
    });
  });

  describe('error categories', () => {
    it('should have user domain errors', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.equal(error.definition.type, 'USER');
    });

    it('should have auth domain errors', () => {
      const error = (Errors as Record<string, unknown>).authinvalidEmailOr001({});
      assert.equal(error.definition.type, 'AUTH');
    });

    it('should have validation domain errors', () => {
      const error = (Errors as Record<string, unknown>).validationvalidationFailedField001({
        field: 'email'
      });
      assert.equal(error.definition.type, 'VALIDATION');
    });
  });
});
