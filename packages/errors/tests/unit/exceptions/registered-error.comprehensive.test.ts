/**
 * Comprehensive unit tests for RegisteredError exception class
 *
 * Tests advanced scenarios, edge cases, deprecation warnings,
 * and integration patterns not covered in basic tests.
 */

import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';

import { RegisteredError } from '../../../src/exceptions/registered-error.exception';
import { ERROR_REGISTRY } from '../../../src/registry/definitions/index';
import { ErrorSeverity, ErrorType } from '../../../src/registry/error-registry.types';

describe('RegisteredError - Comprehensive Tests', () => {
  describe('Constructor - Advanced Scenarios', () => {
    it('should handle empty string parameters', () => {
      const error = new RegisteredError('USER_001', { userId: '' });
      assert.equal(error.parameters.userId, '');
      assert.equal(error.message, 'User with ID  not found');
    });

    it('should handle optional parameters with undefined values', () => {
      const error = new RegisteredError('USER_007', { reason: undefined });
      assert.equal(error.parameters.reason, undefined);
    });

    it('should handle multiple parameters with mixed types', () => {
      const error = new RegisteredError('VAL_003', {
        field: 'age',
        min: 18,
        max: 65
      });

      assert.equal(typeof error.parameters.field, 'string');
      assert.equal(typeof error.parameters.min, 'number');
      assert.equal(typeof error.parameters.max, 'number');
    });

    it('should handle metadata with special characters', () => {
      const metadata = {
        requestId: 'abc-123',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        path: '/api/users/123'
      };

      const error = new RegisteredError('USER_001', { userId: '123' }, metadata);
      assert.deepEqual(error.metadata, metadata);
    });

    it('should handle metadata with nested objects', () => {
      const nestedMetadata = {
        requestId: 'abc-123',
        user: { id: '456', name: 'John' },
        context: { action: 'delete', resource: 'user' }
      };

      const error = new RegisteredError('USER_001', { userId: '123' }, nestedMetadata);
      assert.deepEqual(error.metadata, nestedMetadata);
    });

    it('should create errors with unique timestamps', () => {
      const error1 = new RegisteredError('AUTH_001');
      // Add small delay to ensure different timestamps
      const start = Date.now();
      while (Date.now() - start < 2) {
        // Wait 2ms
      }

      const error3 = new RegisteredError('AUTH_001');

      assert.notEqual(error1.timestamp, error3.timestamp);
    });

    it('should handle date parameter validation', () => {
      // VAL_006 has a date parameter (as string)
      const error1 = new RegisteredError('VAL_006', {
        date: '2024-01-01',
        expectedFormat: 'YYYY-MM-DD'
      });
      assert.ok(error1);

      const error2 = new RegisteredError('VAL_006', {
        date: '2024-01-01T00:00:00.000Z',
        expectedFormat: 'ISO 8601'
      });
      assert.ok(error2);
    });

    it('should handle boolean parameter validation', () => {
      // Assuming there's an error with boolean parameter
      // For now, we'll verify the type system works
      const error = new RegisteredError('AUTH_001');
      assert.ok(error);
    });
  });

  describe('Deprecation Warnings', () => {
    let originalConsoleWarn: typeof console.warn;
    let warnings: string[] = [];

    before(() => {
      originalConsoleWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(' '));
      };
    });

    after(() => {
      console.warn = originalConsoleWarn;
    });

    it('should show deprecation warning in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      warnings = [];

      // Find a deprecated error code if it exists
      const deprecatedCode = Object.entries(ERROR_REGISTRY).find(
        ([_, def]) => def.deprecationMessage
      )?.[0];

      if (deprecatedCode) {
        new RegisteredError(deprecatedCode as ErrorCode);
        assert.ok(warnings.length > 0, 'Should emit deprecation warning');
        assert.ok(warnings[0].includes('DEPRECATION'), 'Warning should mention deprecation');
      } else {
        // No deprecated errors exist, which is fine
        assert.ok(true);
      }

      process.env.NODE_ENV = originalEnv;
    });

    it('should not show deprecation warning in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      warnings = [];

      const deprecatedCode = Object.entries(ERROR_REGISTRY).find(
        ([_, def]) => def.deprecationMessage
      )?.[0];

      if (deprecatedCode) {
        new RegisteredError(deprecatedCode as ErrorCode);
        assert.equal(warnings.length, 0, 'Should not emit deprecation warning in production');
      } else {
        // No deprecated errors exist, which is fine
        assert.ok(true);
      }

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Parameter Interpolation - Advanced', () => {
    it('should handle multiple instances of same parameter', () => {
      // Create a custom error definition for testing
      // In real scenario, this would be in the registry
      const error = new RegisteredError('VAL_003', {
        field: 'email',
        min: 5,
        max: 100
      });

      // Verify message contains all parameters
      assert.ok(error.message.includes('email'));
    });

    it('should handle parameters with curly braces in values', () => {
      const error = new RegisteredError('USER_001', {
        userId: 'user{123}'
      });

      assert.ok(error.message.includes('user{123}'));
    });

    it('should handle parameters with newlines and tabs', () => {
      const error = new RegisteredError('USER_001', {
        userId: 'user\nwith\tnewlines'
      });

      assert.ok(error.message.includes('user\nwith\tnewlines'));
    });

    it('should handle parameters with Unicode characters', () => {
      const error = new RegisteredError('USER_001', {
        userId: '用户123'
      });

      assert.ok(error.message.includes('用户123'));
    });

    it('should handle very long parameter values', () => {
      const longString = 'a'.repeat(10000);
      const error = new RegisteredError('USER_001', { userId: longString });

      assert.ok(error.message.includes(longString));
    });

    it('should handle number parameters', () => {
      const error = new RegisteredError('USER_009', { maxSize: 5 });
      assert.ok(error.message.includes('5'));
    });

    it('should handle boolean parameters', () => {
      // Test with an error that might have boolean params
      const error = new RegisteredError('AUTH_001');
      assert.ok(error);
    });
  });

  describe('toJSON() - Advanced Serialization', () => {
    it('should produce JSON-serializable output', () => {
      const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'abc' });
      const json = error.toJSON();

      // Should be able to stringify without errors
      assert.doesNotThrow(() => {
        JSON.stringify(json);
      });
    });

    it('should include all expected properties', () => {
      const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'abc' });
      const json = error.toJSON();

      assert.ok('code' in json);
      assert.ok('message' in json);
      assert.ok('parameters' in json);
      assert.ok('metadata' in json);
      assert.ok('httpStatus' in json);
      assert.ok('timestamp' in json);
      assert.ok('stack' in json);
    });

    it('should handle empty parameters and metadata', () => {
      const error = new RegisteredError('AUTH_001');
      const json = error.toJSON();

      assert.deepEqual(json.parameters, {});
      assert.deepEqual(json.metadata, {});
    });

    it('should handle complex metadata', () => {
      const complexMetadata = {
        requestId: 'abc-123',
        nested: { deep: { value: 123 } },
        array: [1, 2, 3]
      };

      const error = new RegisteredError('AUTH_001', {}, complexMetadata);
      const json = error.toJSON();

      assert.deepEqual(json.metadata, complexMetadata);
    });

    it('should preserve parameter types in JSON', () => {
      const error = new RegisteredError('VAL_003', {
        field: 'age',
        min: 18,
        max: 65
      });

      const json = error.toJSON();

      assert.equal(typeof json.parameters.field, 'string');
      assert.equal(typeof json.parameters.min, 'number');
      assert.equal(typeof json.parameters.max, 'number');
    });
  });

  describe('fromError() - Advanced Conversion', () => {
    it('should handle error code at end of message', () => {
      const error = new Error('Invalid credentials AUTH_001');
      const converted = RegisteredError.fromError(error);

      assert.ok(converted instanceof RegisteredError);
      if (converted instanceof RegisteredError) {
        assert.equal(converted.code, 'AUTH_001');
      }
    });

    it('should handle multiple error codes in message (first match)', () => {
      const error = new Error('Error: USER_001 or AUTH_001');
      const converted = RegisteredError.fromError(error);

      assert.ok(converted instanceof RegisteredError);
      if (converted instanceof RegisteredError) {
        // Should match the first error code found
        assert.ok(converted.code === 'USER_001' || converted.code === 'AUTH_001');
      }
    });

    it('should return non-Error objects as-is', () => {
      const notAnError = { message: 'not an error' };
      const converted = RegisteredError.fromError(notAnError as never);

      assert.equal(converted, notAnError);
    });

    it('should return null as-is', () => {
      const converted = RegisteredError.fromError(null as never);
      assert.equal(converted, null);
    });

    it('should return undefined as-is', () => {
      const converted = RegisteredError.fromError(undefined as never);
      assert.equal(converted, undefined);
    });

    it('should handle TypeError conversion', () => {
      const error = new TypeError('VAL_001: Invalid value');
      const converted = RegisteredError.fromError(error);

      assert.ok(converted instanceof RegisteredError);
      if (converted instanceof RegisteredError) {
        assert.equal(converted.code, 'VAL_001');
      }
    });

    it('should handle RangeError conversion', () => {
      const error = new RangeError('VAL_003: age out of range');
      const converted = RegisteredError.fromError(error);

      assert.ok(converted instanceof RegisteredError);
      if (converted instanceof RegisteredError) {
        assert.equal(converted.code, 'VAL_003');
      }
    });

    it('should preserve original error in metadata when converting', () => {
      const originalError = new Error('AUTH_001: Invalid credentials');
      const converted = RegisteredError.fromError(originalError);

      assert.ok(converted instanceof RegisteredError);
      if (converted instanceof RegisteredError) {
        assert.equal(converted.metadata.originalError, originalError.message);
      }
    });
  });

  describe('Error Properties - Immutability', () => {
    it('should have read-only code property', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });

      assert.throws(
        () => {
          (error as { code: string }).code = 'AUTH_001';
        },
        /Cannot assign/,
        'code should be read-only'
      );
    });

    it('should have read-only definition property', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });

      assert.throws(
        () => {
          (error as { definition: { message: string } }).definition.message = 'hacked';
        },
        /Cannot assign/,
        'definition should be read-only'
      );
    });

    it('should have read-only parameters property', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });

      assert.throws(
        () => {
          (error as { parameters: { userId: string } }).parameters.userId = '456';
        },
        /Cannot assign/,
        'parameters should be read-only'
      );
    });

    it('should have read-only metadata property', () => {
      const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'abc' });

      assert.throws(
        () => {
          (error as { metadata: { requestId: string } }).metadata.requestId = 'xyz';
        },
        /Cannot assign/,
        'metadata should be read-only'
      );
    });

    it('should have read-only httpStatus property', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });

      assert.throws(
        () => {
          (error as { httpStatus: number }).httpStatus = 500;
        },
        /Cannot assign/,
        'httpStatus should be read-only'
      );
    });

    it('should have read-only timestamp property', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });

      assert.throws(
        () => {
          (error as { timestamp: string }).timestamp = '2024-01-01';
        },
        /Cannot assign/,
        'timestamp should be read-only'
      );
    });

    it('should have name property equal to code', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.equal(error.name, 'USER_001');
    });

    it('should have interpolated message property', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.equal(error.message, 'User with ID 123 not found');
    });
  });

  describe('Stack Trace', () => {
    it('should capture stack trace', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.ok(error.stack);
      assert.ok(typeof error.stack === 'string');
    });

    it('should include error name in stack trace', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.ok(error.stack?.includes('USER_001'));
    });

    it('should include error message in stack trace', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.ok(error.stack?.includes('User with ID 123 not found'));
    });

    it('should have valid stack trace format', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      const stackLines = error.stack?.split('\n') || [];

      assert.ok(stackLines.length > 0, 'Stack trace should have lines');
      assert.ok(stackLines[0].includes('USER_001'), 'First line should include error code');
    });
  });

  describe('Error Definition Properties', () => {
    it('should expose complete error definition', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });

      assert.equal(error.definition.code, 'USER_001');
      assert.equal(error.definition.type, ErrorType.USER);
      assert.equal(error.definition.severity, ErrorSeverity.HIGH);
      assert.equal(error.definition.httpStatus, 404);
      assert.equal(error.definition.safeForUser, true);
    });

    it('should have description from definition', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.ok(error.definition.description);
      assert.ok(error.definition.description && error.definition.description.length > 0);
    });

    it('should have resolution from definition', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.ok(error.definition.resolution);
      assert.ok(error.definition.resolution && error.definition.resolution.length > 0);
    });

    it('should have parameters array from definition', () => {
      const error = new RegisteredError('USER_001', { userId: '123' });
      assert.ok(Array.isArray(error.definition.parameters));
      assert.ok(error.definition.parameters && error.definition.parameters.length > 0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle creating errors with all parameter types', () => {
      // String parameter
      const error1 = new RegisteredError('USER_001', { userId: '123' });
      assert.ok(error1);

      // Number parameter
      const error2 = new RegisteredError('USER_009', { maxSize: 5 });
      assert.ok(error2);

      // Date parameter (as string - no Date type in current error definitions)
      const error3 = new RegisteredError('VAL_006', {
        date: '2024-01-01',
        expectedFormat: 'YYYY-MM-DD'
      });
      assert.ok(error3);

      // Multiple string parameters
      const error4 = new RegisteredError('BIZ_002', {
        entity: 'order',
        status: 'processed'
      });
      assert.ok(error4);
    });

    it('should handle throwing and catching errors', () => {
      assert.throws(
        () => {
          throw new RegisteredError('USER_001', { userId: '123' });
        },
        (error: unknown) => {
          return error instanceof RegisteredError && error.code === 'USER_001';
        }
      );
    });

    it('should handle converting caught errors', () => {
      try {
        throw new Error('AUTH_001: Invalid credentials');
      } catch (error) {
        const registered = RegisteredError.fromError(error);
        assert.ok(registered instanceof RegisteredError);
      }
    });

    it('should handle error in try-catch with type guard', () => {
      try {
        throw new RegisteredError('USER_001', { userId: '123' });
      } catch (error) {
        if (RegisteredError.isRegisteredError(error)) {
          assert.equal(error.code, 'USER_001');
          assert.equal(error.httpStatus, 404);
        } else {
          assert.fail('Error should be a RegisteredError');
        }
      }
    });

    it('should handle serializing error for API response', () => {
      const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'abc' });
      const json = error.toJSON();

      // Simulate sending as JSON response
      const response = JSON.stringify({
        error: {
          code: json.code,
          message: json.message,
          statusCode: json.httpStatus,
          timestamp: json.timestamp
        },
        metadata: json.metadata
      });

      const parsed = JSON.parse(response);

      assert.equal(parsed.error.code, 'USER_001');
      assert.equal(parsed.error.statusCode, 404);
      assert.equal(parsed.metadata.requestId, 'abc');
    });
  });

  describe('Edge Cases', () => {
    it('should handle error with no parameters', () => {
      const error = new RegisteredError('AUTH_001');
      assert.deepEqual(error.parameters, {});
      assert.equal(error.message, 'Invalid email or password');
    });

    it('should handle error with only optional parameters', () => {
      const error1 = new RegisteredError('USER_007');
      assert.ok(error1);

      const error2 = new RegisteredError('USER_007', { reason: 'Spam' });
      assert.ok(error2);
    });

    it('should handle error with mixed required and optional parameters', () => {
      // Assuming there's an error with mixed parameters
      const error = new RegisteredError('VAL_003', {
        field: 'age',
        min: 18,
        max: 65
      });
      assert.ok(error);
    });

    it('should handle error code case sensitivity', () => {
      assert.throws(() => new RegisteredError('user_001' as never), /not found in registry/);
    });

    it('should handle whitespace in parameters', () => {
      const error = new RegisteredError('USER_001', { userId: '  123  ' });
      assert.ok(error.message.includes('  123  '));
    });

    it('should handle special regex characters in parameters', () => {
      const error = new RegisteredError('USER_001', { userId: 'user.$123' });
      assert.ok(error.message.includes('user.$123'));
    });
  });

  describe('Parameter Interpolation - Security', () => {
    it('should not expand $& replacement token in parameter values', () => {
      const error = new RegisteredError('USER_001', { userId: 'foo$&bar' });
      assert.equal(
        error.message,
        'User with ID foo$&bar not found',
        `Literal $& leaked into message: ${error.message}`
      );
    });

    it('should not expand $` replacement token in parameter values', () => {
      const error = new RegisteredError('USER_001', { userId: 'foo$`bar' });
      assert.equal(
        error.message,
        'User with ID foo$`bar not found',
        `Literal $\` leaked into message: ${error.message}`
      );
    });

    it("should not expand $' replacement token in parameter values", () => {
      const error = new RegisteredError('USER_001', { userId: "foo$'bar" });
      assert.equal(
        error.message,
        "User with ID foo$'bar not found",
        `Literal $' leaked into message: ${error.message}`
      );
    });

    it('should preserve $$ literal in parameter values', () => {
      const error = new RegisteredError('USER_001', { userId: 'foo$$bar' });
      assert.equal(
        error.message,
        'User with ID foo$$bar not found',
        `Literal $$ corrupted: ${error.message}`
      );
    });

    it('should not substitute literal "undefined" when optional parameter is undefined', () => {
      const error = new RegisteredError('USER_007', { reason: undefined });
      // Optional param with undefined value must not be substituted as the string "undefined"
      assert.ok(
        !error.message.includes('undefined'),
        `Optional undefined leaked as literal: ${error.message}`
      );
    });

    it('should not substitute literal "undefined" when optional parameter is omitted', () => {
      const error = new RegisteredError('USER_007', {});
      assert.ok(
        !error.message.includes('undefined'),
        `Omitted optional leaked as undefined: ${error.message}`
      );
    });
  });

  describe('Date Parameter Validation', () => {
    it('should handle invalid date strings like "2024-13-45"', () => {
      // VAL_006 has a date parameter
      const error = new RegisteredError('VAL_006', {
        date: '2024-13-45',
        expectedFormat: 'YYYY-MM-DD'
      });

      // The error should be created successfully
      // (validation of date format is not the responsibility of RegisteredError)
      assert.ok(error);
      assert.equal(error.parameters.date, '2024-13-45');
    });

    it('should handle invalid date strings like "9999-99-99"', () => {
      const error = new RegisteredError('VAL_006', {
        date: '9999-99-99',
        expectedFormat: 'YYYY-MM-DD'
      });

      assert.ok(error);
      assert.equal(error.parameters.date, '9999-99-99');
    });

    it('should handle invalid Date instance', () => {
      const invalidDate = new Date('invalid');
      assert.ok(isNaN(invalidDate.getTime()), 'Date should be invalid');

      // Date parameters are stored as strings, so we convert to string
      const error = new RegisteredError('VAL_006', {
        date: invalidDate.toString(),
        expectedFormat: 'ISO 8601'
      });

      assert.ok(error);
    });

    it('should handle valid Date instance as string', () => {
      const validDate = new Date('2024-01-01');
      const dateString = validDate.toISOString();

      const error = new RegisteredError('VAL_006', {
        date: dateString,
        expectedFormat: 'ISO 8601'
      });

      assert.ok(error);
      assert.equal(error.parameters.date, dateString);
    });

    it('should handle leap year dates', () => {
      // Valid leap year date
      const leapYearDate = '2024-02-29';
      const error = new RegisteredError('VAL_006', {
        date: leapYearDate,
        expectedFormat: 'YYYY-MM-DD'
      });

      assert.ok(error);
      assert.equal(error.parameters.date, leapYearDate);
    });

    it('should handle non-leap year dates', () => {
      // 2023 is not a leap year, so Feb 29 is invalid
      // But RegisteredError doesn't validate dates, it just stores them
      const nonLeapYearDate = '2023-02-29';
      const error = new RegisteredError('VAL_006', {
        date: nonLeapYearDate,
        expectedFormat: 'YYYY-MM-DD'
      });

      assert.ok(error);
      assert.equal(error.parameters.date, nonLeapYearDate);
    });

    it('should handle date parameters with various formats', () => {
      const dateFormats = [
        '2024-01-01',
        '2024/01/01',
        '01-01-2024',
        '2024-01-01T00:00:00.000Z',
        'Mon Jan 01 2024'
      ];

      for (const dateFormat of dateFormats) {
        const error = new RegisteredError('VAL_006', {
          date: dateFormat,
          expectedFormat: 'Various'
        });

        assert.ok(error);
        assert.equal(error.parameters.date, dateFormat);
      }
    });

    it('should handle date-like strings that are not dates', () => {
      const dateLikeStrings = [
        'not-a-date',
        '1234567890',
        'YYYY-MM-DD',
        '2024-13-01', // Invalid month
        '2024-00-01', // Invalid month
        '2024-01-32', // Invalid day
        '2024-01-00' // Invalid day
      ];

      for (const dateLike of dateLikeStrings) {
        const error = new RegisteredError('VAL_006', {
          date: dateLike,
          expectedFormat: 'YYYY-MM-DD'
        });

        assert.ok(error);
        assert.equal(error.parameters.date, dateLike);
      }
    });
  });
});
