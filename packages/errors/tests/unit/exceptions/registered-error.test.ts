/**
 * Unit tests for RegisteredError exception class
 *
 * Tests the framework-agnostic exception class and its methods.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { RegisteredError } from '../../../src/exceptions/registered-error.exception';

describe('RegisteredError', () => {
  describe('constructor', () => {
    it('should create error with code and parameters', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });

      assert.equal(error.code, 'USER_001');
      assert.equal(error.name, 'USER_001');
      assert.equal(error.message, 'User with ID 123 not found');
      assert.equal(error.httpStatus, 404);
    });

    it('should create error without parameters', () => {
      const error = new RegisteredError('AUTH_001');

      assert.equal(error.code, 'AUTH_001');
      assert.equal(error.message, 'Invalid email or password');
      assert.equal(error.httpStatus, 401);
    });

    it('should store metadata separately', () => {
      const metadata = { requestId: 'abc-123', userId: '456' };
      const error = new RegisteredError('USER_001', { userId: '123' }, metadata);

      assert.deepEqual(error.metadata, metadata);
      assert.equal(error.parameters.userId, '123');
    });

    it('should freeze parameters and metadata', () => {
      const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'abc' });

      // Object.freeze doesn't throw in non-strict mode, so we check if the object is frozen
      assert.ok(Object.isFrozen(error.parameters));
      assert.ok(Object.isFrozen(error.metadata));
    });

    it('should include timestamp', () => {
      const error = new RegisteredError('AUTH_001'); // Use AUTH_001 which has no required params
      assert.ok(error.timestamp);
      assert.ok(new Date(error.timestamp).toISOString() === error.timestamp);
    });

    it('should throw for invalid error code', () => {
      assert.throws(
        () => new RegisteredError('INVALID_001' as never),
        /Error code "INVALID_001" not found in registry/
      );
    });

    it('should throw for missing required parameters', () => {
      assert.throws(() => new RegisteredError('USER_001'), /Missing required parameters: userId/);
    });

    it('should throw for invalid parameter types', () => {
      assert.throws(() => new RegisteredError('USER_001', { userId: 123 }), /Invalid parameters/);
    });

    it('should handle optional parameters', () => {
      const error1 = new RegisteredError('USER_007');
      assert.ok(error1);

      const error2 = new RegisteredError('USER_007', {}, { reason: 'Spam' });
      assert.ok(error2);
    });
  });

  describe('toJSON', () => {
    it('should serialize to plain object', () => {
      const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'abc' });
      const json = error.toJSON();

      assert.equal(json.code, 'USER_001');
      assert.equal(json.message, 'User with ID 123 not found');
      assert.deepEqual(json.parameters, { userId: '123' });
      assert.deepEqual(json.metadata, { requestId: 'abc' });
      assert.equal(json.httpStatus, 404);
      assert.ok(json.timestamp);
      assert.ok(json.stack);
    });

    it('should include stack trace', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      const json = error.toJSON();

      assert.ok(json.stack);
      assert.ok(typeof json.stack === 'string');
    });
  });

  describe('isRegisteredError', () => {
    it('should return true for RegisteredError instances', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.equal(RegisteredError.isRegisteredError(error), true);
    });

    it('should return false for non-RegisteredError', () => {
      const error = new Error('Plain error');
      assert.equal(RegisteredError.isRegisteredError(error), false);
    });

    it('should return false for null/undefined', () => {
      assert.equal(RegisteredError.isRegisteredError(null), false);
      assert.equal(RegisteredError.isRegisteredError(undefined), false);
    });
  });

  describe('fromError', () => {
    it('should return RegisteredError as-is', () => {
      const original = new RegisteredError('USER_001', { userId: '123' });
      const converted = RegisteredError.fromError(original);

      assert.equal(converted, original);
    });

    it('should convert plain Error with error code in message', () => {
      const error = new Error('AUTH_001: Invalid email or password');
      const converted = RegisteredError.fromError(error);

      assert.ok(converted instanceof RegisteredError);
      if (converted instanceof RegisteredError) {
        assert.equal(converted.code, 'AUTH_001');
      }
    });

    it('should return plain Error if not convertible', () => {
      const error = new Error('Some random error');
      const converted = RegisteredError.fromError(error);

      assert.equal(converted, error);
      assert.ok(!(converted instanceof RegisteredError));
    });
  });

  describe('parameter interpolation', () => {
    it('should interpolate multiple parameters', () => {
      const error = new RegisteredError('VAL_003', {
        field: 'age',
        min: 18,
        max: 65
      });

      assert.ok(error.message.includes('age'));
      assert.ok(error.message.includes('18'));
      assert.ok(error.message.includes('65'));
    });

    it('should handle special characters in parameters', () => {
      const error = new RegisteredError('USER_003', {
        email: 'user+test@example.com'
      });

      assert.ok(error.message.includes('user+test@example.com'));
    });
  });
});
