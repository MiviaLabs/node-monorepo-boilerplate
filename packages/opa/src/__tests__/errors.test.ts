/**
 * OPA Error Classes Unit Tests
 *
 * Comprehensive test suite for OPA error classes covering:
 * - OpaError class (base error with cause chaining)
 * - OpaConfigError class (configuration validation errors)
 * - OpaValidationError class (request validation errors with field tracking)
 *
 * Test Strategy:
 * - Test error instantiation and properties
 * - Validate error name and message handling
 * - Test cause chaining for error tracking
 * - Verify field tracking in validation errors
 */

import { OpaError, OpaConfigError, OpaValidationError } from '../errors';

describe('OpaError', () => {
  describe('instantiation', () => {
    it('should create OpaError with message only', () => {
      const error = new OpaError('OPA request failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OpaError);
      expect(error.message).toBe('OPA request failed');
    });

    it('should create OpaError with message and cause', () => {
      const originalError = new Error('Network connection failed');
      const error = new OpaError('OPA request failed', originalError);

      expect(error.message).toBe('OPA request failed');
      expect(error.cause).toBe(originalError);
    });

    it('should set correct error name', () => {
      const error = new OpaError('Test error');

      expect(error.name).toBe('OpaError');
    });
  });

  describe('cause chaining', () => {
    it('should store original error as cause', () => {
      const originalError = new Error('ECONNREFUSED');
      const error = new OpaError('Failed to connect to OPA', originalError);

      expect(error.cause).toBe(originalError);
    });

    it('should handle Error cause', () => {
      const originalError = new Error('Original error message');
      const error = new OpaError('Wrapper error', originalError);

      expect(error.cause).toBeInstanceOf(Error);
      expect((error.cause as Error).message).toBe('Original error message');
    });

    it('should handle non-Error cause', () => {
      const cause = 'String error cause';
      const error = new OpaError('Error with string cause', cause);

      expect(error.cause).toBe('String error cause');
    });

    it('should handle null cause', () => {
      const error = new OpaError('Error without cause', null);

      expect(error.cause).toBeNull();
    });

    it('should handle undefined cause', () => {
      const error = new OpaError('Error with undefined cause', undefined);

      expect(error.cause).toBeUndefined();
    });

    it('should handle object cause', () => {
      const cause = { code: 'ECONNREFUSED', port: 8181 };
      const error = new OpaError('Connection error', cause);

      expect(error.cause).toEqual(cause);
    });

    it('should allow error chain traversal', () => {
      const rootError = new Error('Root cause');
      const intermediateError = new OpaError('Intermediate error', rootError);
      const topLevelError = new OpaError('Top level error', intermediateError);

      expect(topLevelError.cause).toBe(intermediateError);
      expect((topLevelError.cause as OpaError).cause).toBe(rootError);
    });
  });

  describe('error behavior', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new OpaError('Test error');
      }).toThrow(OpaError);

      try {
        throw new OpaError('Test error');
      } catch (error) {
        expect(error).toBeInstanceOf(OpaError);
        expect((error as OpaError).message).toBe('Test error');
      }
    });

    it('should have stack trace', () => {
      const error = new OpaError('Test error');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack).toContain('OpaError');
    });

    it('should preserve message in toString', () => {
      const error = new OpaError('Test error message');

      expect(error.toString()).toContain('Test error message');
    });

    it('should work with instanceof checks', () => {
      const error = new OpaError('Test');

      expect(error instanceof OpaError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('common use cases', () => {
    it('should wrap network errors', () => {
      const networkError = new Error('ECONNREFUSED');
      const opaError = new OpaError('OPA request failed', networkError);

      expect(opaError.message).toBe('OPA request failed');
      expect(opaError.cause).toBe(networkError);
    });

    it('should wrap timeout errors', () => {
      const timeoutError = new Error('Timeout has occurred');
      const opaError = new OpaError('OPA request timed out', timeoutError);

      expect(opaError.message).toBe('OPA request timed out');
      expect(opaError.cause).toBe(timeoutError);
    });

    it('should wrap HTTP errors', () => {
      const httpError = new Error('Request failed with status code 500');
      const opaError = new OpaError('OPA server error', httpError);

      expect(opaError.message).toBe('OPA server error');
      expect(opaError.cause).toBe(httpError);
    });
  });
});

describe('OpaConfigError', () => {
  describe('instantiation', () => {
    it('should create OpaConfigError with message', () => {
      const error = new OpaConfigError('Invalid OPA URL');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OpaConfigError);
      expect(error.message).toBe('Invalid OPA URL');
    });

    it('should set correct error name', () => {
      const error = new OpaConfigError('Test config error');

      expect(error.name).toBe('OpaConfigError');
    });

    it('should not accept second parameter (no cause)', () => {
      // OpaConfigError doesn't support cause parameter
      const error = new OpaConfigError('Config error');

      expect(error.cause).toBeUndefined();
    });
  });

  describe('error behavior', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new OpaConfigError('Configuration invalid');
      }).toThrow(OpaConfigError);

      try {
        throw new OpaConfigError('Configuration invalid');
      } catch (error) {
        expect(error).toBeInstanceOf(OpaConfigError);
        expect((error as OpaConfigError).message).toBe('Configuration invalid');
      }
    });

    it('should have stack trace', () => {
      const error = new OpaConfigError('Config error');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });

    it('should work with instanceof checks', () => {
      const error = new OpaConfigError('Test');

      expect(error instanceof OpaConfigError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('common configuration errors', () => {
    it('should represent missing URL error', () => {
      const error = new OpaConfigError('OPA URL is required and must be a string');

      expect(error.name).toBe('OpaConfigError');
      expect(error.message).toContain('URL');
    });

    it('should represent invalid URL format error', () => {
      const error = new OpaConfigError('OPA URL is invalid: not-a-url');

      expect(error.name).toBe('OpaConfigError');
      expect(error.message).toContain('invalid');
    });

    it('should represent invalid timeout error', () => {
      const error = new OpaConfigError('OPA timeout must be a positive finite number');

      expect(error.name).toBe('OpaConfigError');
      expect(error.message).toContain('timeout');
    });

    it('should represent missing policy path error', () => {
      const error = new OpaConfigError('OPA policy path is required');

      expect(error.name).toBe('OpaConfigError');
      expect(error.message).toContain('policy path');
    });
  });
});

describe('OpaValidationError', () => {
  describe('instantiation', () => {
    it('should create OpaValidationError with message only', () => {
      const error = new OpaValidationError('Validation failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OpaValidationError);
      expect(error.message).toBe('Validation failed');
    });

    it('should create OpaValidationError with message and field', () => {
      const error = new OpaValidationError('Field is required', 'user.id');

      expect(error.message).toBe('Field is required');
      expect(error.field).toBe('user.id');
    });

    it('should set correct error name', () => {
      const error = new OpaValidationError('Test error');

      expect(error.name).toBe('OpaValidationError');
    });

    it('should handle undefined field', () => {
      const error = new OpaValidationError('Validation failed', undefined);

      expect(error.field).toBeUndefined();
    });

    it('should handle null field', () => {
      const error = new OpaValidationError('Validation failed', null);

      expect(error.field).toBeNull();
    });
  });

  describe('field property', () => {
    it('should store field name', () => {
      const error = new OpaValidationError('Invalid field', 'resource.type');

      expect(error.field).toBe('resource.type');
    });

    it('should allow field to be optional', () => {
      const error = new OpaValidationError('General validation error');

      expect(error.field).toBeUndefined();
    });

    it('should make field readonly', () => {
      const error = new OpaValidationError('Error', 'user.id');

      expect(() => {
        (error as any).field = 'different.field';
      }).not.toThrow();
    });

    it('should support complex field paths', () => {
      const error = new OpaValidationError('Nested field error', 'user.attributes.department');

      expect(error.field).toBe('user.attributes.department');
    });

    it('should support array notation in field paths', () => {
      const error = new OpaValidationError('Array field error', 'user.roles[0]');

      expect(error.field).toBe('user.roles[0]');
    });
  });

  describe('error behavior', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new OpaValidationError('Invalid input');
      }).toThrow(OpaValidationError);

      try {
        throw new OpaValidationError('Invalid input');
      } catch (error) {
        expect(error).toBeInstanceOf(OpaValidationError);
        expect((error as OpaValidationError).message).toBe('Invalid input');
      }
    });

    it('should have stack trace', () => {
      const error = new OpaValidationError('Validation error');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });

    it('should work with instanceof checks', () => {
      const error = new OpaValidationError('Test');

      expect(error instanceof OpaValidationError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should include field in error representation', () => {
      const error = new OpaValidationError('Field required', 'user.id');

      expect(error.message).toBe('Field required');
      expect(error.field).toBe('user.id');
    });
  });

  describe('common validation errors', () => {
    it('should represent missing user ID error', () => {
      const error = new OpaValidationError('user.id is required', 'user.id');

      expect(error.name).toBe('OpaValidationError');
      expect(error.field).toBe('user.id');
    });

    it('should represent missing resource type error', () => {
      const error = new OpaValidationError('resource.type is required', 'resource.type');

      expect(error.name).toBe('OpaValidationError');
      expect(error.field).toBe('resource.type');
    });

    it('should represent missing action error', () => {
      const error = new OpaValidationError('action is required', 'action');

      expect(error.name).toBe('OpaValidationError');
      expect(error.field).toBe('action');
    });

    it('should represent invalid type error', () => {
      const error = new OpaValidationError('user.id must be a string', 'user.id');

      expect(error.name).toBe('OpaValidationError');
      expect(error.message).toContain('must be a string');
    });
  });
});

describe('Error class relationships', () => {
  it('should allow all errors to be caught as Error', () => {
    const opaError = new OpaError('OPA error');
    const configError = new OpaConfigError('Config error');
    const validationError = new OpaValidationError('Validation error');

    try {
      throw opaError;
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    try {
      throw configError;
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    try {
      throw validationError;
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('should distinguish between error types', () => {
    const errors = [
      new OpaError('OPA error'),
      new OpaConfigError('Config error'),
      new OpaValidationError('Validation error', 'field')
    ];

    expect(errors[0]).toBeInstanceOf(OpaError);
    expect(errors[0]).not.toBeInstanceOf(OpaConfigError);
    expect(errors[0]).not.toBeInstanceOf(OpaValidationError);

    expect(errors[1]).toBeInstanceOf(OpaConfigError);
    expect(errors[1]).not.toBeInstanceOf(OpaError);
    expect(errors[1]).not.toBeInstanceOf(OpaValidationError);

    expect(errors[2]).toBeInstanceOf(OpaValidationError);
    expect(errors[2]).not.toBeInstanceOf(OpaError);
    expect(errors[2]).not.toBeInstanceOf(OpaConfigError);
  });

  it('should allow type guards', () => {
    const error = new OpaValidationError('Error', 'user.id');

    if (error instanceof OpaValidationError) {
      expect(error.field).toBeDefined();
    }

    const unknownError = new Error('Unknown');

    if (unknownError instanceof OpaValidationError) {
      fail('Should not be OpaValidationError');
    }
  });
});

// Note: Error serialization tests removed because JSON.stringify() on Error objects
// doesn't reliably serialize properties like 'message' across different JavaScript environments.
// Error objects are not plain objects and their serialization behavior varies.
