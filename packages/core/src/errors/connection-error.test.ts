/**
 * Unit tests for connection error classes
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  ConnectionError,
  AuthenticationError,
  ServiceUnavailableError,
  NetworkError
} from './connection-error.js';

describe('ConnectionError', () => {
  describe('error code handling', () => {
    it('should have default code CONNECTION_ERROR', () => {
      const error = new ConnectionError('TestService', 'Connection failed');

      assert.strictEqual(error.code, 'CONNECTION_ERROR');
      assert.strictEqual(error.name, 'ConnectionError');
      assert.strictEqual(error.message, 'Connection error to TestService: Connection failed');
    });

    it('should accept custom error code', () => {
      const error = new ConnectionError(
        'TestService',
        'Connection failed',
        undefined,
        'CUSTOM_ERROR_CODE'
      );

      assert.strictEqual(error.code, 'CUSTOM_ERROR_CODE');
      assert.strictEqual(error.name, 'ConnectionError');
    });

    it('should preserve cause when provided', () => {
      const originalError = new Error('Original error');
      const error = new ConnectionError('TestService', 'Connection failed', originalError);

      assert.strictEqual(error.cause, originalError);
    });
  });

  describe('error message formatting', () => {
    it('should format message with service name', () => {
      const error = new ConnectionError('Redis', 'Connection refused on port 6379');

      assert.strictEqual(
        error.message,
        'Connection error to Redis: Connection refused on port 6379'
      );
    });

    it('should work with different service names', () => {
      const error = new ConnectionError('PostgreSQL', 'SSL handshake failed');

      assert.strictEqual(error.message, 'Connection error to PostgreSQL: SSL handshake failed');
    });
  });
});

describe('AuthenticationError', () => {
  describe('error code handling', () => {
    it('should have specific error code AUTHENTICATION_ERROR', () => {
      const error = new AuthenticationError('Redis');

      assert.strictEqual(error.code, 'AUTHENTICATION_ERROR');
      assert.strictEqual(error.name, 'AuthenticationError');
    });

    it('should have correct error message', () => {
      const error = new AuthenticationError('PostgreSQL');

      assert.strictEqual(
        error.message,
        'Connection error to PostgreSQL: Authentication failed. Check credentials.'
      );
    });

    it('should preserve cause when provided', () => {
      const originalError = new Error('Invalid password');
      const error = new AuthenticationError('Database', originalError);

      assert.strictEqual(error.cause, originalError);
    });
  });

  describe('inheritance', () => {
    it('should be instance of ConnectionError', () => {
      const error = new AuthenticationError('Redis');

      assert.ok(error instanceof ConnectionError);
      assert.ok(error instanceof AuthenticationError);
    });
  });
});

describe('ServiceUnavailableError', () => {
  describe('error code handling', () => {
    it('should have specific error code SERVICE_UNAVAILABLE_ERROR', () => {
      const error = new ServiceUnavailableError('RabbitMQ');

      assert.strictEqual(error.code, 'SERVICE_UNAVAILABLE_ERROR');
      assert.strictEqual(error.name, 'ServiceUnavailableError');
    });

    it('should have correct error message', () => {
      const error = new ServiceUnavailableError('Elasticsearch');

      assert.strictEqual(
        error.message,
        'Connection error to Elasticsearch: Service is temporarily unavailable'
      );
    });

    it('should preserve cause when provided', () => {
      const timeoutError = new Error('Connection timeout');
      const error = new ServiceUnavailableError('API', timeoutError);

      assert.strictEqual(error.cause, timeoutError);
    });
  });

  describe('inheritance', () => {
    it('should be instance of ConnectionError', () => {
      const error = new ServiceUnavailableError('RabbitMQ');

      assert.ok(error instanceof ConnectionError);
      assert.ok(error instanceof ServiceUnavailableError);
    });
  });
});

describe('NetworkError', () => {
  describe('error code handling', () => {
    it('should have specific error code NETWORK_ERROR', () => {
      const error = new NetworkError('PostgreSQL', 'DNS lookup failed');

      assert.strictEqual(error.code, 'NETWORK_ERROR');
      assert.strictEqual(error.name, 'NetworkError');
    });

    it('should have correct error message format', () => {
      const error = new NetworkError('Redis', 'Connection refused on port 6379');

      assert.strictEqual(
        error.message,
        'Connection error to Redis: Connection refused on port 6379'
      );
    });

    it('should preserve cause when provided', () => {
      const networkError = new Error('ECONNREFUSED');
      const error = new NetworkError('API', 'Connection refused', networkError);

      assert.strictEqual(error.cause, networkError);
    });
  });

  describe('inheritance', () => {
    it('should be instance of ConnectionError', () => {
      const error = new NetworkError('PostgreSQL', 'Network failure');

      assert.ok(error instanceof ConnectionError);
      assert.ok(error instanceof NetworkError);
    });
  });
});

describe('error code uniqueness', () => {
  it('should have unique error codes for each error type', () => {
    const connectionError = new ConnectionError('Service1', 'Message1');
    const authError = new AuthenticationError('Service2');
    const unavailableError = new ServiceUnavailableError('Service3');
    const networkError = new NetworkError('Service4', 'Message4');

    const codes = new Set([
      connectionError.code,
      authError.code,
      unavailableError.code,
      networkError.code
    ]);

    // All codes should be unique
    assert.strictEqual(codes.size, 4);
    assert.ok(codes.has('CONNECTION_ERROR'));
    assert.ok(codes.has('AUTHENTICATION_ERROR'));
    assert.ok(codes.has('SERVICE_UNAVAILABLE_ERROR'));
    assert.ok(codes.has('NETWORK_ERROR'));
  });
});
