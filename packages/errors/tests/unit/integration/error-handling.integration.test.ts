/**
 * Integration tests for Error Handling System
 *
 * Tests cross-cutting concerns, end-to-end scenarios,
 * and integration patterns across the entire error system.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { Errors } from '../../../src/exceptions/index';
import { RegisteredError } from '../../../src/exceptions/registered-error.exception';
import {
  ERROR_REGISTRY,
  getErrorDefinition,
  isErrorCode,
  getErrorCodesByType,
  validateErrorParameters,
  ErrorType,
  isErrorData
} from '../../../src/registry/error-registry';
import { isErrorResponse } from '../../../src/types/error-data.types';

import type {
  ErrorData,
  ErrorMetadata,
  ErrorParameters
} from '../../../src/registry/error-registry.types';

describe('Error Handling System - Integration Tests', () => {
  describe('End-to-End Error Creation Flow', () => {
    it('should create error using factory and convert to ErrorData', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({
        userId: '123'
      }) as RegisteredError;

      const errorData: ErrorData = {
        code: error.code,
        message: error.message,
        statusCode: error.httpStatus,
        severity: error.definition.severity,
        type: error.definition.type,
        timestamp: error.timestamp,
        resolution: error.definition.resolution
      };

      assert.equal(isErrorData(errorData), true);
      assert.equal(errorData.code, 'USER_001');
      assert.equal(errorData.statusCode, 404);
    });

    it('should create error using constructor and serialize to response', () => {
      const metadata: ErrorMetadata = {
        requestId: 'req-123',
        userId: 'user-456'
      };

      const error = new RegisteredError('USER_001', { userId: '123' }, metadata);
      const json = error.toJSON();

      const response = {
        data: {
          code: json.code,
          message: json.message,
          translated: json.message
        },
        metadata: {
          timestamp: json.timestamp,
          requestId: json.metadata?.requestId,
          error: {
            category: error.definition.type,
            severity: error.definition.severity,
            httpStatus: json.httpStatus
          }
        }
      };

      assert.equal(isErrorResponse(response), true);
      assert.equal(response.data.code, 'USER_001');
      assert.equal(response.metadata.requestId, 'req-123');
    });

    it('should handle full error lifecycle from creation to serialization', () => {
      // 1. Create error using factory
      const error = (Errors as Record<string, unknown>).authinvalidEmailOr001(
        {}
      ) as RegisteredError;

      // 2. Verify error properties
      assert.equal(error.code, 'AUTH_001');
      assert.equal(error.httpStatus, 401);

      // 3. Convert to JSON
      const json = error.toJSON();

      // 4. Verify JSON structure
      assert.ok(json.code);
      assert.ok(json.message);
      assert.ok(json.timestamp);
      assert.ok(json.stack);

      // 5. Convert to ErrorData
      const errorData: ErrorData = {
        code: json.code,
        message: json.message,
        statusCode: json.httpStatus,
        severity: error.definition.severity,
        type: error.definition.type,
        timestamp: json.timestamp
      };

      // 6. Verify ErrorData structure
      assert.equal(isErrorData(errorData), true);

      // 7. Wrap in response format
      const response = {
        data: {
          code: errorData.code,
          message: errorData.message,
          translated: errorData.message
        },
        metadata: {
          timestamp: errorData.timestamp,
          error: {
            category: errorData.type,
            severity: errorData.severity,
            httpStatus: errorData.statusCode
          }
        }
      };
      assert.equal(isErrorResponse(response), true);
    });
  });

  describe('Error Type Conversions', () => {
    it('should convert plain Error to RegisteredError', () => {
      const plainError = new Error('USER_001: User not found');
      const registeredError = RegisteredError.fromError(plainError);

      assert.ok(registeredError instanceof RegisteredError);
      if (registeredError instanceof RegisteredError) {
        assert.equal(registeredError.code, 'USER_001');
      }
    });

    it('should convert plain Error to ErrorResponse format', () => {
      const plainError = new Error('USER_001: User not found');
      const registeredError = RegisteredError.fromError(plainError);

      if (registeredError instanceof RegisteredError) {
        const errorData: ErrorData = {
          code: registeredError.code,
          message: registeredError.message,
          statusCode: registeredError.httpStatus,
          severity: registeredError.definition.severity,
          type: registeredError.definition.type,
          timestamp: registeredError.timestamp
        };

        const response = {
          data: {
            code: errorData.code,
            message: errorData.message,
            translated: errorData.message
          },
          metadata: {
            timestamp: errorData.timestamp,
            error: {
              category: errorData.type,
              severity: errorData.severity,
              httpStatus: errorData.statusCode
            }
          }
        };
        assert.equal(isErrorResponse(response), true);
      }
    });

    it('should handle conversion from different error types', () => {
      const errorTypes = [
        new Error('AUTH_001: Invalid credentials'),
        new TypeError('VAL_001: Invalid type'),
        new RangeError('VAL_003: Out of range')
      ];

      for (const error of errorTypes) {
        const converted = RegisteredError.fromError(error);
        assert.ok(converted instanceof RegisteredError || converted instanceof Error);
      }
    });
  });

  describe('Error Recovery and Handling Patterns', () => {
    it('should handle unknown error codes gracefully', () => {
      const isValid = isErrorCode('UNKNOWN_001');
      assert.equal(isValid, false);

      const definition = getErrorDefinition('UNKNOWN_001');
      assert.equal(definition, undefined);
    });

    it('should provide default handling for non-convertible errors', () => {
      const plainError = new Error('Some random error');
      const converted = RegisteredError.fromError(plainError);

      // Should return original error if not convertible
      assert.equal(converted, plainError);
      assert.ok(!(converted instanceof RegisteredError));
    });

    it('should allow custom error handling with type guards', () => {
      const errors: unknown[] = [
        new RegisteredError('USER_001', { userId: '123' }),
        new Error('Plain error'),
        { code: 'USER_001', message: 'Not an error' },
        null
      ];

      let registeredCount = 0;
      let plainCount = 0;
      let otherCount = 0;

      for (const error of errors) {
        if (RegisteredError.isRegisteredError(error)) {
          registeredCount++;
        } else if (error instanceof Error) {
          plainCount++;
        } else {
          otherCount++;
        }
      }

      assert.equal(registeredCount, 1);
      assert.equal(plainCount, 1);
      assert.equal(otherCount, 2);
    });
  });

  describe('Error Registry and Factory Integration', () => {
    it('should have factory methods for all registry errors', () => {
      const registryCodes = Object.keys(ERROR_REGISTRY);
      const factoryMethods = Object.getOwnPropertyNames(Errors).filter(
        (key) => typeof (Errors as Record<string, unknown>)[key] === 'function'
      );

      // The number of factory methods should match or exceed the number of error codes
      assert.ok(
        factoryMethods.length >= registryCodes.length,
        `Should have at least ${registryCodes.length} factory methods, got ${factoryMethods.length}`
      );

      // Sample check: verify factory methods exist for some error codes
      // Note: Method names are generated from error messages, not from error codes directly
      // So we check that there's at least one factory method for each domain
      const domains = [
        'user',
        'auth',
        'validation',
        'database',
        'business',
        'external',
        'file',
        'system'
      ];

      for (const domain of domains) {
        const matchingMethods = factoryMethods.filter((key) => key.startsWith(domain));
        assert.ok(matchingMethods.length > 0, `Should have factory methods for ${domain} domain`);
      }
    });

    it('should maintain consistency between registry and factory', () => {
      const error = (Errors as Record<string, unknown>).useruserWithId001({
        userId: '123'
      }) as RegisteredError;

      const definition = getErrorDefinition('USER_001');

      assert.ok(definition);
      assert.equal(error.code, definition.code);
      assert.equal(error.httpStatus, definition.httpStatus);
      assert.equal(error.definition.message, definition.message);
    });
  });

  describe('Parameter Validation Integration', () => {
    it('should validate parameters consistently across registry and constructor', () => {
      const parameters = { userId: '123' };

      // Validate using registry function
      const registryValidation = validateErrorParameters('USER_001', parameters);

      // Create error (which also validates)
      const error = new RegisteredError('USER_001', parameters);

      assert.equal(registryValidation.valid, true);
      assert.equal(error.parameters.userId, '123');
    });

    it('should fail validation consistently', () => {
      const invalidParameters = { userId: 123 }; // Wrong type

      // Validate using registry function
      const registryValidation = validateErrorParameters('USER_001', invalidParameters);

      // Try to create error
      assert.throws(
        () => new RegisteredError('USER_001', invalidParameters as never),
        /Invalid parameters/
      );

      assert.equal(registryValidation.valid, false);
    });
  });

  describe('Type System Integration', () => {
    it('should use type guards to narrow types correctly', () => {
      const unknownValue: unknown = {
        code: 'USER_001',
        message: 'User not found',
        statusCode: 404
      };

      if (isErrorData(unknownValue)) {
        // TypeScript should know this is ErrorData
        assert.equal(typeof unknownValue.code, 'string');
        assert.equal(typeof unknownValue.statusCode, 'number');
      } else {
        assert.fail('Should be ErrorData');
      }
    });

    it('should narrow error types with isRegisteredError', () => {
      const unknownError: unknown = new RegisteredError('USER_001', { userId: '123' });

      if (RegisteredError.isRegisteredError(unknownError)) {
        // TypeScript should know this is RegisteredError
        assert.equal(unknownError.code, 'USER_001');
        assert.equal(typeof unknownError.httpStatus, 'number');
      } else {
        assert.fail('Should be RegisteredError');
      }
    });

    it('should narrow response types with isErrorResponse', () => {
      const unknownResponse: unknown = {
        data: {
          code: 'USER_001',
          message: 'User not found',
          translated: 'User not found'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          error: {
            category: 'USER',
            severity: 'HIGH',
            httpStatus: 404
          }
        }
      };

      if (isErrorResponse(unknownResponse)) {
        // TypeScript should know this is ErrorResponse
        assert.equal(typeof unknownResponse.data.code, 'string');
        assert.equal(typeof unknownResponse.metadata.error.httpStatus, 'number');
      } else {
        assert.fail('Should be ErrorResponse');
      }
    });
  });

  describe('Error Metadata Integration', () => {
    it('should preserve metadata through serialization', () => {
      const metadata: ErrorMetadata = {
        requestId: 'req-123',
        userId: 'user-456',
        action: 'deleteUser',
        timestamp: new Date().toISOString()
      };

      const error = new RegisteredError('USER_001', { userId: '123' }, metadata);
      const json = error.toJSON();

      assert.deepEqual(json.metadata, metadata);
      assert.equal(json.metadata.requestId, 'req-123');
      assert.equal(json.metadata.userId, 'user-456');
    });

    it('should handle complex nested metadata', () => {
      const metadata: ErrorMetadata = {
        requestId: 'req-123',
        user: { id: '456', name: 'John', roles: ['admin', 'user'] },
        context: { action: 'delete', resource: 'user', params: { id: '123' } }
      };

      const error = new RegisteredError('USER_001', { userId: '123' }, metadata);
      const json = error.toJSON();

      assert.deepEqual(json.metadata, metadata);
      assert.deepEqual(json.metadata.user, metadata.user);
      assert.deepEqual(json.metadata.context, metadata.context);
    });
  });

  describe('Multi-Tenant Error Context', () => {
    it('should handle tenant-specific error metadata', () => {
      const metadata: ErrorMetadata = {
        tenantId: 'tenant-abc',
        organizationId: 'org-123',
        userId: 'user-456',
        requestId: 'req-789'
      };

      const error = new RegisteredError('USER_001', { userId: '123' }, metadata);

      assert.equal(error.metadata.tenantId, 'tenant-abc');
      assert.equal(error.metadata.organizationId, 'org-123');
      assert.equal(error.metadata.userId, 'user-456');
    });

    it('should serialize tenant context in error response', () => {
      const metadata: ErrorMetadata = {
        tenantId: 'tenant-abc',
        organizationId: 'org-123'
      };

      const error = new RegisteredError('USER_001', { userId: '123' }, metadata);
      const json = error.toJSON();

      const response = {
        data: {
          code: json.code,
          message: json.message,
          statusCode: json.httpStatus,
          severity: error.definition.severity,
          type: error.definition.type,
          timestamp: json.timestamp,
          context: {
            tenantId: json.metadata.tenantId,
            organizationId: json.metadata.organizationId
          }
        }
      };

      assert.equal(response.data.context?.tenantId, 'tenant-abc');
      assert.equal(response.data.context?.organizationId, 'org-123');
    });
  });

  describe('Error Filtering and Querying', () => {
    it('should filter errors by type', () => {
      const userErrors = getErrorCodesByType(ErrorType.USER);
      const authErrors = getErrorCodesByType(ErrorType.AUTH);

      assert.ok(userErrors.length > 0);
      assert.ok(authErrors.length > 0);
      assert.ok(userErrors.every((code) => code.startsWith('USER_')));
      assert.ok(authErrors.every((code) => code.startsWith('AUTH_')));
    });

    it('should allow creating errors from filtered codes', () => {
      const userErrors = getErrorCodesByType(ErrorType.USER);

      // Create errors for first few user error codes
      for (const code of userErrors.slice(0, 3)) {
        const definition = getErrorDefinition(code);
        assert.ok(definition);

        // Create error with appropriate parameters
        const params = buildParametersForCode(code, definition);
        const error = new RegisteredError(code, params);

        assert.equal(error.code, code);
      }
    });

    function buildParametersForCode(
      code: string,
      definition: ReturnType<typeof getErrorDefinition>
    ): ErrorParameters {
      if (!definition || !definition.parameters || definition.parameters.length === 0) {
        return {};
      }

      const params: Record<string, unknown> = {};

      for (const param of definition.parameters) {
        if (param.required) {
          switch (param.type) {
            case 'string':
              params[param.name] = 'test';
              break;
            case 'number':
              params[param.name] = 123;
              break;
            case 'boolean':
              params[param.name] = true;
              break;
            case 'date':
              params[param.name] = new Date();
              break;
            case 'object':
              params[param.name] = {};
              break;
          }
        }
      }

      return params;
    }
  });

  describe('Error Immutability Across System', () => {
    it('should maintain immutability through entire error lifecycle', () => {
      const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'abc' });

      // Verify all objects are frozen
      assert.ok(Object.isFrozen(error.parameters));
      assert.ok(Object.isFrozen(error.metadata));
      assert.ok(Object.isFrozen(ERROR_REGISTRY));
      assert.ok(Object.isFrozen(error.definition));

      // Attempting to modify should throw
      assert.throws(() => {
        (error.parameters as Record<string, unknown>).userId = '456';
      });

      assert.throws(() => {
        (error.metadata as Record<string, unknown>).requestId = 'xyz';
      });
    });
  });

  describe('Real-World Usage Scenarios', () => {
    it('should handle API error response pattern', () => {
      // Simulate API endpoint that throws error
      try {
        throw (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' });
      } catch (error) {
        if (RegisteredError.isRegisteredError(error)) {
          // Convert to API response format
          const response = {
            data: {
              code: error.code,
              message: error.message,
              translated: error.message
            },
            metadata: {
              timestamp: error.timestamp,
              error: {
                category: error.definition.type,
                severity: error.definition.severity,
                httpStatus: error.httpStatus
              }
            }
          };

          assert.equal(isErrorResponse(response), true);
          assert.equal(response.metadata.error.httpStatus, 404);
        } else {
          assert.fail('Should be RegisteredError');
        }
      }
    });

    it('should handle error logging pattern', () => {
      const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'req-123' });
      const json = error.toJSON();

      // Simulate logging structure
      const logEntry = {
        level: 'error',
        code: json.code,
        message: json.message,
        statusCode: json.httpStatus,
        severity: error.definition.severity,
        type: error.definition.type,
        timestamp: json.timestamp,
        metadata: json.metadata,
        stack: json.stack
      };

      assert.equal(logEntry.code, 'USER_001');
      assert.equal(logEntry.metadata.requestId, 'req-123');
      assert.ok(logEntry.stack);
    });

    it('should handle error aggregation pattern', () => {
      const errors = [
        (Errors as Record<string, unknown>).useruserWithId001({ userId: '123' }),
        (Errors as Record<string, unknown>).authinvalidEmailOr001({})
      ] as RegisteredError[];

      const errorSummary = {
        count: errors.length,
        codes: errors.map((e) => e.code),
        severities: errors.map((e) => e.definition.severity),
        httpStatuses: errors.map((e) => e.httpStatus)
      };

      assert.equal(errorSummary.count, 2);
      assert.ok(errorSummary.codes.includes('USER_001'));
      assert.ok(errorSummary.codes.includes('AUTH_001'));
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle rapid error creation efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        const error = new RegisteredError('AUTH_001');
        error.toJSON(); // Also serialize
      }

      const duration = Date.now() - start;
      assert.ok(
        duration < 5000,
        `Creating and serializing 1000 errors should take < 5s, took ${duration}ms`
      );
    });

    it('should handle registry queries efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        getErrorDefinition('USER_001');
        isErrorCode('AUTH_001');
        getErrorCodesByType(ErrorType.USER);
      }

      const duration = Date.now() - start;
      assert.ok(duration < 1000, `10000 registry queries should take < 1s, took ${duration}ms`);
    });
  });
});
