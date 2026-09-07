/**
 * Unit tests for Google Error Mapper
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  AuthenticationError,
  TokenValidationError,
  UserInfoRetrievalError,
  InvalidAuthProviderConfigError,
  AuthProviderConnectionError
} from '../../../errors';
import {
  GoogleErrorMapper,
  mapGoogleError,
  mapGoogleFetchError
} from '../../../errors/google-error.mapper';

describe('GoogleErrorMapper', () => {
  describe('fromHttpResponse', () => {
    it('should map invalid_grant error to AuthenticationError', () => {
      const body = {
        error: 'invalid_grant',
        error_description: 'The token has expired'
      };

      const error = GoogleErrorMapper.fromHttpResponse(401, body, 'Test context');

      assert.ok(error instanceof AuthenticationError);
      assert.strictEqual(error.message, 'The token has expired');
    });

    it('should map invalid_client error to InvalidAuthProviderConfigError', () => {
      const body = {
        error: 'invalid_client',
        error_description: 'Invalid client credentials'
      };

      const error = GoogleErrorMapper.fromHttpResponse(401, body, 'Test context');

      assert.ok(error instanceof InvalidAuthProviderConfigError);
      assert.ok(error.message.includes('Invalid client credentials'));
    });

    it('should map access_denied error to AuthenticationError', () => {
      const body = {
        error: 'access_denied',
        error_description: 'Access denied'
      };

      const error = GoogleErrorMapper.fromHttpResponse(403, body, 'Test context');

      assert.ok(error instanceof AuthenticationError);
      assert.strictEqual(error.message, 'Access denied');
    });

    it('should map expired_token error to TokenValidationError', () => {
      const body = {
        error: 'expired_token',
        error_description: 'Token has expired'
      };

      const error = GoogleErrorMapper.fromHttpResponse(401, body, 'Test context');

      assert.ok(error instanceof TokenValidationError);
      assert.strictEqual(error.message, 'Token has expired');
    });

    it('should map invalid_request error to InvalidAuthProviderConfigError', () => {
      const body = {
        error: 'invalid_request',
        error_description: 'Invalid request'
      };

      const error = GoogleErrorMapper.fromHttpResponse(400, body, 'Test context');

      assert.ok(error instanceof InvalidAuthProviderConfigError);
      assert.ok(error.message.includes('Invalid request'));
    });

    it('should map redirect_uri_mismatch error to InvalidAuthProviderConfigError', () => {
      const body = {
        error: 'redirect_uri_mismatch',
        error_description: 'Redirect URI mismatch'
      };

      const error = GoogleErrorMapper.fromHttpResponse(400, body, 'Test context');

      assert.ok(error instanceof InvalidAuthProviderConfigError);
      assert.ok(error.message.includes('Redirect URI mismatch'));
    });

    it('should map rate_limit_exceeded error to TokenValidationError', () => {
      const body = {
        error: 'rate_limit_exceeded',
        error_description: 'Rate limit exceeded'
      };

      const error = GoogleErrorMapper.fromHttpResponse(429, body, 'Test context');

      assert.ok(error instanceof TokenValidationError);
      assert.strictEqual(error.message, 'Rate limit exceeded');
    });

    it('should map server_error error to AuthProviderConnectionError', () => {
      const body = {
        error: 'server_error',
        error_description: 'Internal server error'
      };

      const error = GoogleErrorMapper.fromHttpResponse(500, body, 'Test context');

      assert.ok(error instanceof AuthProviderConnectionError);
    });

    it('should fall back to HTTP status code mapping for unknown error codes', () => {
      const body = {
        error: 'unknown_error',
        error_description: 'Unknown error occurred'
      };

      const error = GoogleErrorMapper.fromHttpResponse(401, body, 'Test context');

      // Falls back to HTTP status mapping - 401 maps to AuthenticationError
      assert.ok(error instanceof AuthenticationError);
    });

    it('should use default error message if error_description is missing', () => {
      const body = {
        error: 'invalid_grant'
      };

      const error = GoogleErrorMapper.fromHttpResponse(401, body, 'Test context');

      assert.ok(error instanceof AuthenticationError);
      assert.strictEqual(error.message, 'Test context: invalid_grant');
    });

    it('should handle empty body', () => {
      const error = GoogleErrorMapper.fromHttpResponse(401, {}, 'Test context');

      assert.ok(error instanceof AuthenticationError);
      assert.ok(error.message.includes('401'));
    });

    it('should map 400 status to InvalidAuthProviderConfigError', () => {
      const error = GoogleErrorMapper.fromHttpResponse(400, {}, 'Test context');

      assert.ok(error instanceof InvalidAuthProviderConfigError);
    });

    it('should map 403 status to AuthenticationError', () => {
      const error = GoogleErrorMapper.fromHttpResponse(403, {}, 'Test context');

      assert.ok(error instanceof AuthenticationError);
    });

    it('should map 404 status to UserInfoRetrievalError', () => {
      const error = GoogleErrorMapper.fromHttpResponse(404, {}, 'Test context');

      assert.ok(error instanceof UserInfoRetrievalError);
    });

    it('should map 429 status to TokenValidationError', () => {
      const error = GoogleErrorMapper.fromHttpResponse(429, {}, 'Test context');

      assert.ok(error instanceof TokenValidationError);
    });
  });

  describe('fromNetworkError', () => {
    it('should map network error to AuthProviderConnectionError', () => {
      const originalError = new Error('ECONNREFUSED');

      const error = GoogleErrorMapper.fromNetworkError(originalError, 'Connection failed');

      assert.ok(error instanceof AuthProviderConnectionError);
      assert.ok(error.message.includes('Connection failed'));
      assert.ok(error.message.includes('ECONNREFUSED'));
    });

    it('should handle string errors', () => {
      const error = GoogleErrorMapper.fromNetworkError('Network failure', 'Test context');

      assert.ok(error instanceof AuthProviderConnectionError);
      assert.ok(error.message.includes('Network failure'));
    });
  });

  describe('fromFetchError', () => {
    it('should map TypeError with fetch message to network error', () => {
      const fetchError = new TypeError('fetch failed');

      const error = GoogleErrorMapper.fromFetchError(fetchError, 'Test context');

      assert.ok(error instanceof AuthProviderConnectionError);
      assert.ok(error.message.includes('fetch failed'));
    });

    it('should map AbortError to timeout error', () => {
      const abortError = new DOMException('Request timeout', 'AbortError');

      const error = GoogleErrorMapper.fromFetchError(abortError, 'Test context');

      assert.ok(error instanceof AuthProviderConnectionError);
      assert.ok(error.message.includes('timeout'));
    });

    it('should map generic Error to connection error', () => {
      const genericError = new Error('Something went wrong');

      const error = GoogleErrorMapper.fromFetchError(genericError, 'Test context');

      assert.ok(error instanceof AuthProviderConnectionError);
      assert.ok(error.message.includes('Something went wrong'));
    });

    it('should handle non-Error objects', () => {
      const error = GoogleErrorMapper.fromFetchError('string error', 'Test context');

      assert.ok(error instanceof AuthProviderConnectionError);
      assert.ok(error.message.includes('string error'));
    });
  });
});

describe('mapGoogleError helper function', () => {
  it('should map Google errors correctly', () => {
    const body = {
      error: 'invalid_grant',
      error_description: 'Invalid grant'
    };

    const error = mapGoogleError(401, body, 'Test context');

    assert.ok(error instanceof AuthenticationError);
  });
});

describe('mapGoogleFetchError helper function', () => {
  it('should map fetch errors correctly', () => {
    const fetchError = new TypeError('fetch failed');

    const error = mapGoogleFetchError(fetchError, 'Test context');

    assert.ok(error instanceof AuthProviderConnectionError);
  });
});
