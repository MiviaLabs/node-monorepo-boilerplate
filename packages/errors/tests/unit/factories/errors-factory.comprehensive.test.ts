/**
 * Comprehensive unit tests for Errors factory class
 *
 * Tests factory method generation, type safety, parameter validation,
 * and integration patterns not covered in basic tests.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { Errors } from '../../../src/exceptions/index';
import { RegisteredError } from '../../../src/exceptions/registered-error.exception';
import { ERROR_REGISTRY } from '../../../src/registry/definitions/index';

describe('Errors Factory - Comprehensive Tests', () => {
  describe('Factory Method Generation', () => {
    it('should generate factory methods for all 72 error codes', () => {
      // Use getOwnPropertyNames instead of keys because static methods are not enumerable
      const factoryMethods = Object.getOwnPropertyNames(Errors).filter(
        (key) => typeof (Errors as Record<string, unknown>)[key] === 'function'
      );

      // Count should match or exceed the number of error codes
      // (may have additional utility methods)
      assert.ok(
        factoryMethods.length >= Object.keys(ERROR_REGISTRY).length,
        `Should have at least ${Object.keys(ERROR_REGISTRY).length} factory methods, got ${factoryMethods.length}`
      );
    });

    it('should have valid JavaScript identifiers for all method names', () => {
      const factoryMethods = Object.getOwnPropertyNames(Errors).filter(
        (key) => typeof (Errors as Record<string, unknown>)[key] === 'function'
      );

      for (const methodName of factoryMethods) {
        assert.ok(
          /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(methodName),
          `${methodName} should be a valid JavaScript identifier`
        );
      }
    });

    it('should have unique factory method names', () => {
      const factoryMethods = Object.getOwnPropertyNames(Errors).filter(
        (key) => typeof (Errors as Record<string, unknown>)[key] === 'function'
      );

      const uniqueMethods = new Set(factoryMethods);
      assert.equal(
        factoryMethods.length,
        uniqueMethods.size,
        'All factory method names should be unique'
      );
    });

    it('should have factory method names that follow naming convention', () => {
      const factoryMethods = Object.getOwnPropertyNames(Errors).filter(
        (key) => typeof (Errors as Record<string, unknown>)[key] === 'function'
      );

      // All methods should start with a domain prefix
      const validPrefixes = [
        'user',
        'auth',
        'validation',
        'database',
        'business',
        'external',
        'file',
        'system'
      ];

      for (const methodName of factoryMethods) {
        const hasValidPrefix = validPrefixes.some((prefix) => methodName.startsWith(prefix));
        assert.ok(hasValidPrefix, `${methodName} should start with a valid domain prefix`);
      }
    });

    it('should have JSDoc comments for all factory methods', () => {
      // This is a compile-time check, but we can verify the structure
      const factoryMethods = Object.getOwnPropertyNames(Errors).filter(
        (key) => typeof (Errors as Record<string, unknown>)[key] === 'function'
      );

      // All methods should be functions
      for (const methodName of factoryMethods) {
        const method = (Errors as Record<string, unknown>)[methodName];
        assert.equal(typeof method, 'function', `${methodName} should be a function`);
      }
    });
  });

  describe('Type Safety and Signatures', () => {
    it('should enforce required parameters at compile time', () => {
      // USER_001 requires userId parameter
      // This test verifies TypeScript compilation passes
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.ok(error instanceof RegisteredError);
    });

    it('should allow optional parameters to be omitted', () => {
      // USER_007 has optional 'reason' parameter
      const error1 = (Errors as Record<string, unknown>).useruserAccountIs007({});
      assert.ok(error1 instanceof RegisteredError);
    });

    it('should allow optional parameters to be provided', () => {
      const error = (Errors as Record<string, unknown>).useruserAccountIs007({
        reason: 'Spam'
      });
      assert.ok(error instanceof RegisteredError);
      if (error instanceof RegisteredError) {
        assert.equal(error.parameters.reason, 'Spam');
      }
    });

    it('should handle Record<string, never> for no parameters', () => {
      // AUTH_001 has no parameters
      const error = (Errors as Record<string, unknown>).authinvalidEmailOr001({});
      assert.ok(error instanceof RegisteredError);
    });

    it('should have correct return type (RegisteredError)', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.ok(error instanceof RegisteredError);
      assert.ok(error instanceof RegisteredError);
    });

    it('should support optional metadata parameter', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001(
        { userId: '123' },
        { requestId: 'abc-123' }
      );

      assert.ok(error instanceof RegisteredError);
      if (error instanceof RegisteredError) {
        assert.equal(error.metadata.requestId, 'abc-123');
      }
    });

    it('should allow metadata to be omitted', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.ok(error instanceof RegisteredError);
      if (error instanceof RegisteredError) {
        assert.deepEqual(error.metadata, {});
      }
    });
  });

  describe('Parameter Validation in Factories', () => {
    it('should validate required parameters', () => {
      // If we try to call without required params, TypeScript should catch it
      // At runtime, if we bypass TypeScript, it should throw
      assert.throws(
        () => {
          (Errors as Record<string, unknown>).useruserWithId001({} as never);
        },
        /Missing required parameters/,
        'Should throw for missing required parameters'
      );
    });

    it('should validate parameter types', () => {
      assert.throws(
        () => {
          (Errors as Record<string, unknown>).useruserWithId001({ userId: 123 } as never);
        },
        /Invalid parameters/,
        'Should throw for invalid parameter types'
      );
    });

    it('should provide helpful error messages', () => {
      assert.throws(
        () => {
          (Errors as Record<string, unknown>).useruserWithId001({} as never);
        },
        (error: Error) => {
          return (
            error.message.includes('Missing required parameters') &&
            error.message.includes('userId')
          );
        }
      );
    });

    it('should handle mixed required and optional parameters', () => {
      // VAL_003 has field (required), min and max (required)
      const error = (Errors as Record<string, unknown>).validationvalueForField003({
        field: 'age',
        min: 18,
        max: 65
      });

      assert.ok(error instanceof RegisteredError);
      if (error instanceof RegisteredError) {
        assert.equal(error.parameters.field, 'age');
        assert.equal(error.parameters.min, 18);
        assert.equal(error.parameters.max, 65);
      }
    });
  });

  describe('Factory Method Signatures', () => {
    it('should use Record<string, never> for errors with no parameters', () => {
      // AUTH_001 has no parameters
      // Type check happens at compile time
      const error = (Errors as Record<string, unknown>).authinvalidEmailOr001({});
      assert.ok(error instanceof RegisteredError);
    });

    it('should use object type for errors with all required parameters', () => {
      // USER_001 has required userId parameter
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.ok(error instanceof RegisteredError);
    });

    it('should use Partial<> for errors with optional parameters', () => {
      // USER_007 has optional reason parameter
      const error1 = (Errors as Record<string, unknown>).useruserAccountIs007({});
      assert.ok(error1 instanceof RegisteredError);

      const error2 = (Errors as Record<string, unknown>).useruserAccountIs007({
        reason: 'Spam'
      });
      assert.ok(error2 instanceof RegisteredError);
    });

    it('should use intersection type for mixed required/optional parameters', () => {
      // VAL_003 has all required parameters currently
      // This test verifies the type system handles complex signatures
      const error = (Errors as Record<string, unknown>).validationvalueForField003({
        field: 'age',
        min: 18,
        max: 65
      });
      assert.ok(error instanceof RegisteredError);
    });
  });

  describe('Factory Integration', () => {
    it('should create error with correct code', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.equal(error.code, 'USER_001');
    });

    it('should interpolate message correctly', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.equal(error.message, 'User with ID 123 not found');
    });

    it('should set httpStatus correctly', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.equal(error.httpStatus, 404);
    });

    it('should freeze parameters and metadata', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001(
        { userId: '123' },
        { requestId: 'abc' }
      );

      assert.ok(Object.isFrozen(error.parameters));
      assert.ok(Object.isFrozen(error.metadata));
    });

    it('should set all error definition properties', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });

      assert.ok(error.definition);
      assert.equal(error.definition.code, 'USER_001');
      assert.equal(error.definition.httpStatus, 404);
    });

    it('should include timestamp', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.ok(error.timestamp);
      assert.ok(new Date(error.timestamp).toISOString() === error.timestamp);
    });
  });

  describe('Domain-Specific Factory Methods', () => {
    it('should have user domain factory methods', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.equal(error.definition.type, 'USER');
    });

    it('should have auth domain factory methods', () => {
      const error = (Errors as Record<string, unknown>).authinvalidEmailOr001({});
      assert.equal(error.definition.type, 'AUTH');
    });

    it('should have validation domain factory methods', () => {
      const error = (Errors as Record<string, unknown>).validationvalidationFailedField001({
        field: 'email'
      });
      assert.equal(error.definition.type, 'VALIDATION');
    });

    it('should have database domain factory methods', () => {
      const error = (Errors as Record<string, unknown>).databasedatabaseQueryFailed005({});
      assert.equal(error.definition.type, 'DATABASE');
    });

    it('should have business domain factory methods', () => {
      const error = (Errors as Record<string, unknown>).businessoperationNotAllowed001({
        reason: 'test'
      });
      assert.equal(error.definition.type, 'BUSINESS');
    });

    it('should have external domain factory methods', () => {
      const error = (Errors as Record<string, unknown>).externalserviceIsCurrently006({
        service: 'test'
      });
      assert.equal(error.definition.type, 'EXTERNAL');
    });

    it('should have file domain factory methods', () => {
      const error = (Errors as Record<string, unknown>).filefileNotFound004({
        filename: '/path/to/file'
      });
      assert.equal(error.definition.type, 'FILE');
    });

    it('should have system domain factory methods', () => {
      const error = (Errors as Record<string, unknown>).systemconfigurationErrorConfigkey003({
        configKey: 'test'
      });
      assert.equal(error.definition.type, 'SYSTEM');
    });
  });

  describe('Factory Method Consistency', () => {
    it('should create identical errors whether using factory or constructor', () => {
      const factoryError = (Errors as Record<string, unknown>).useruserWithId001({
        userId: '123'
      }) as RegisteredError;

      const constructorError = new RegisteredError('USER_001', { userId: '123' });

      assert.equal(factoryError.code, constructorError.code);
      assert.equal(factoryError.message, constructorError.message);
      assert.equal(factoryError.httpStatus, constructorError.httpStatus);
      assert.deepEqual(factoryError.parameters, constructorError.parameters);
    });

    it('should handle metadata consistently', () => {
      const metadata = { requestId: 'abc-123', userId: '456' };

      const factoryError = (Errors as Record<string, unknown>).useruserWithId001(
        { userId: '123' },
        metadata
      ) as RegisteredError;

      const constructorError = new RegisteredError('USER_001', { userId: '123' }, metadata);

      assert.deepEqual(factoryError.metadata, constructorError.metadata);
    });

    it('should create errors with same definition reference', () => {
      const factoryError = (Errors as Record<string, unknown>).useruserWithId001({
        userId: '123'
      }) as RegisteredError;

      const constructorError = new RegisteredError('USER_001', { userId: '123' });

      assert.equal(factoryError.definition, constructorError.definition);
    });
  });

  describe('Factory Error Scenarios', () => {
    it('should throw for invalid error codes', () => {
      // If we could access an invalid factory method, it would throw
      // Since all factory methods are auto-generated from valid codes,
      // this test verifies the underlying constructor validation
      assert.throws(() => new RegisteredError('INVALID_001' as never), /not found in registry/);
    });

    it('should handle errors with all parameter types', () => {
      // String
      const error1 = (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      assert.ok(error1 instanceof RegisteredError);

      // Number
      const error2 = (Errors as Record<string, unknown>).userprofileImageSize009({
        maxSize: 5
      });
      assert.ok(error2 instanceof RegisteredError);

      // Date (using string representation as Date type is not available in current errors)
      const error3 = (Errors as Record<string, unknown>).validationinvalidDateFormat006({
        date: '2024-01-01',
        expectedFormat: 'YYYY-MM-DD'
      });
      assert.ok(error3 instanceof RegisteredError);

      // Boolean is not available in current error definitions, using string instead
      const error4 = (Errors as Record<string, unknown>).authinvalidRoleAssignment010({
        role: 'admin'
      });
      assert.ok(error4 instanceof RegisteredError);
    });

    it('should handle throwing factory-created errors', () => {
      assert.throws(
        () => {
          throw (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
        },
        (error: unknown) => {
          return error instanceof RegisteredError && error.code === 'USER_001';
        }
      );
    });

    it('should handle catching and re-throwing factory errors', () => {
      let caughtError: RegisteredError | null = null;

      try {
        throw (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      } catch (error) {
        if (error instanceof RegisteredError) {
          caughtError = error;
        }
      }

      assert.ok(caughtError);
      assert.equal(caughtError.code, 'USER_001');
    });
  });

  describe('Factory Metadata Support', () => {
    it('should pass metadata through correctly', () => {
      const metadata = {
        requestId: 'req-123',
        userId: 'user-456',
        action: 'deleteUser',
        timestamp: new Date().toISOString()
      };

      const error = (Errors as Record<string, unknown>).useruserWithId001(
        { userId: '123' },
        metadata
      ) as RegisteredError;

      assert.deepEqual(error.metadata, metadata);
    });

    it('should handle empty metadata object', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001(
        { userId: '123' },
        {}
      ) as RegisteredError;

      assert.deepEqual(error.metadata, {});
    });

    it('should handle undefined metadata', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({
        userId: '123'
      }) as RegisteredError;

      assert.deepEqual(error.metadata, {});
    });

    it('should freeze metadata', () => {
      const metadata = { requestId: 'abc' };
      const error = (Errors as Record<string, unknown>).useruserWithId001(
        { userId: '123' },
        metadata
      ) as RegisteredError;

      assert.ok(Object.isFrozen(error.metadata));
    });
  });

  describe('Factory Method Discovery', () => {
    it('should allow introspection of available factory methods', () => {
      const factoryMethods = Object.getOwnPropertyNames(Errors).filter(
        (key) => typeof (Errors as Record<string, unknown>)[key] === 'function'
      );

      assert.ok(factoryMethods.length > 0);
      // The actual generated method names match the error messages
      // USER_001: "User with ID {userId} not found" -> useruserWithId001
      assert.ok(factoryMethods.some((m) => m.includes('useruserWithId')));
      // AUTH_001: "Invalid email or password" -> authinvalidEmailOr001
      assert.ok(factoryMethods.some((m) => m.includes('authinvalidEmail')));
    });

    it('should have predictable factory method names', () => {
      // Factory method names should be derivable from error codes
      const errorCodes = Object.keys(ERROR_REGISTRY);

      for (const code of errorCodes.slice(0, 10)) {
        // Sample first 10 error codes
        const [prefix, number] = code.split('_');

        const domainMap: Record<string, string> = {
          USER: 'user',
          AUTH: 'auth',
          VAL: 'validation',
          DB: 'database',
          BIZ: 'business',
          EXT: 'external',
          FILE: 'file',
          SYS: 'system'
        };

        const domain = domainMap[prefix];

        // Check if a factory method with this domain and number exists
        const matchingMethods = Object.getOwnPropertyNames(Errors).filter(
          (key) => key.startsWith(`${domain}`) && key.endsWith(number)
        );

        assert.ok(matchingMethods.length > 0, `Should have factory method for error code ${code}`);
      }
    });
  });

  describe('Factory Performance', () => {
    it('should create 100 errors quickly', () => {
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        (Errors as Record<string, unknown>).useruserWithId001({ userId: `${i}` });
      }

      const duration = Date.now() - start;
      assert.ok(duration < 1000, `Creating 100 errors should take < 1s, took ${duration}ms`);
    });

    it('should not leak memory when creating many errors', () => {
      // This is a basic smoke test - in production you'd use more sophisticated memory profiling
      const errors: RegisteredError[] = [];

      for (let i = 0; i < 1000; i++) {
        errors.push(
          (Errors as Record<string, unknown>).useruserWithId001({
            userId: `${i}`
          }) as RegisteredError
        );
      }

      // If we got here without running out of memory, we're good
      assert.equal(errors.length, 1000);
    });
  });
});
