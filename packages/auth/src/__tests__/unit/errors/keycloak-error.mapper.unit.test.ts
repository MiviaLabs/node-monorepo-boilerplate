/**
 * Unit tests for Keycloak Error Mapper
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
  KeycloakErrorMapper,
  mapKeycloakError,
  mapFetchError
} from '../../../errors/keycloak-error.mapper';

describe('KeycloakErrorMapper', () => {
  describe('fromHttpResponse', () => {
    it('should map 401 to AuthenticationError', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(401, {}, 'Authentication failed');
      assert(error instanceof AuthenticationError);
      assert.equal(error.name, 'AuthenticationError');
    });

    it('should map 403 to AuthenticationError', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(403, {}, 'Access denied');
      assert(error instanceof AuthenticationError);
    });

    it('should map 404 to UserInfoRetrievalError', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(404, {}, 'User not found');
      assert(error instanceof UserInfoRetrievalError);
    });

    it('should map 429 to TokenValidationError', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(429, {}, 'Rate limit exceeded');
      assert(error instanceof TokenValidationError);
    });

    it('should map 400 to InvalidAuthProviderConfigError', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(400, {}, 'Invalid request');
      assert(error instanceof InvalidAuthProviderConfigError);
    });

    it('should map 500 to AuthProviderConnectionError', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(500, {}, 'Server error');
      assert(error instanceof AuthProviderConnectionError);
    });

    it('should use error_description from response body', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(
        401,
        { error_description: 'Invalid credentials' },
        'Authentication'
      );
      assert(error instanceof AuthenticationError);
      assert.match(error.message, /Invalid credentials/);
    });

    it('should map Keycloak error codes to correct error types', () => {
      const testCases = [
        {
          errorCode: 'invalid_grant',
          expectedClass: AuthenticationError,
          body: { error: 'invalid_grant' }
        },
        {
          errorCode: 'expired_token',
          expectedClass: TokenValidationError,
          body: { error: 'expired_token' }
        },
        {
          errorCode: 'invalid_client',
          expectedClass: InvalidAuthProviderConfigError,
          body: { error: 'invalid_client' }
        },
        {
          errorCode: 'user_not_found',
          expectedClass: UserInfoRetrievalError,
          body: { error: 'user_not_found' }
        },
        {
          errorCode: 'invalid_credentials',
          expectedClass: AuthenticationError,
          body: { error: 'invalid_credentials' }
        },
        {
          errorCode: 'access_denied',
          expectedClass: AuthenticationError,
          body: { error: 'access_denied' }
        },
        {
          errorCode: 'invalid_request',
          expectedClass: InvalidAuthProviderConfigError,
          body: { error: 'invalid_request' }
        },
        {
          errorCode: 'rate_limit_exceeded',
          expectedClass: TokenValidationError,
          body: { error: 'rate_limit_exceeded' }
        },
        {
          errorCode: 'not_found',
          expectedClass: UserInfoRetrievalError,
          body: { error: 'not_found' }
        }
      ];

      for (const testCase of testCases) {
        const error = KeycloakErrorMapper.fromHttpResponse(400, testCase.body, 'Test');
        assert(
          error instanceof testCase.expectedClass,
          `Expected ${testCase.expectedClass.name} for error code '${testCase.errorCode}', got ${error.constructor.name}`
        );
      }
    });

    it('should prioritize Keycloak error codes over HTTP status', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(
        400,
        { error: 'invalid_grant' },
        'Authentication'
      );
      assert(error instanceof AuthenticationError);
    });

    it('should include context in error message when no description provided', () => {
      const error = KeycloakErrorMapper.fromHttpResponse(401, {}, 'User authentication');
      assert.match(error.message, /User authentication/);
    });
  });

  describe('fromNetworkError', () => {
    it('should map network errors to AuthProviderConnectionError', () => {
      const networkError = new Error('ECONNREFUSED');
      const error = KeycloakErrorMapper.fromNetworkError(networkError, 'Connection to Keycloak');
      assert(error instanceof AuthProviderConnectionError);
      assert.match(error.message, /Connection to Keycloak/);
      assert.match(error.message, /ECONNREFUSED/);
    });

    it('should handle unknown error types', () => {
      const error = KeycloakErrorMapper.fromNetworkError('Unknown error', 'Connection');
      assert(error instanceof AuthProviderConnectionError);
    });
  });

  describe('fromFetchError', () => {
    it('should map TypeError fetch errors to connection error', () => {
      const fetchError = new TypeError('fetch failed');
      const error = KeycloakErrorMapper.fromFetchError(fetchError, 'Authentication request');
      assert(error instanceof AuthProviderConnectionError);
      assert.match(error.message, /Authentication request/);
    });

    it('should map AbortError to timeout error', () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      const error = KeycloakErrorMapper.fromFetchError(abortError, 'Token refresh');
      assert(error instanceof AuthProviderConnectionError);
      assert.match(error.message, /timeout/);
    });

    it('should map generic errors to connection error', () => {
      const genericError = new Error('Something went wrong');
      const error = KeycloakErrorMapper.fromFetchError(genericError, 'Health check');
      assert(error instanceof AuthProviderConnectionError);
      assert.match(error.message, /Something went wrong/);
    });

    it('should handle non-Error objects', () => {
      const error = KeycloakErrorMapper.fromFetchError('string error', 'Request');
      assert(error instanceof AuthProviderConnectionError);
    });
  });

  describe('mapKeycloakError helper', () => {
    it('should be a convenience wrapper for fromHttpResponse', () => {
      const error = mapKeycloakError(401, { error: 'invalid_grant' }, 'Auth failed');
      assert(error instanceof AuthenticationError);
    });
  });

  describe('mapFetchError helper', () => {
    it('should be a convenience wrapper for fromFetchError', () => {
      const fetchError = new TypeError('fetch failed');
      const error = mapFetchError(fetchError, 'Request failed');
      assert(error instanceof AuthProviderConnectionError);
    });
  });
});
