/**
 * API Errors Tests
 *
 * Unit tests for API-specific error handling functionality.
 *
 * @packageDocumentation
 */

import { ApiException, API_ERROR_CODES, getApiErrorDefinition, isApiErrorCode } from '../index';

describe('API Error Codes Registry', () => {
  it('should have error codes defined', () => {
    const codes = Object.keys(API_ERROR_CODES);
    // Note: The exact number may vary as new API error codes are added
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.length).toBeLessThanOrEqual(50);
  });

  it('should have API_001-023 codes', () => {
    for (let i = 1; i <= 23; i++) {
      const code = `API_${String(i).padStart(3, '0')}`;
      expect(API_ERROR_CODES[code]).toBeDefined();
      expect(API_ERROR_CODES[code]).toBeTruthy();
    }
  });

  it('should have correct HTTP status for each error code', () => {
    expect(getApiErrorDefinition('API_001')?.httpStatus).toBe(400);
    expect(getApiErrorDefinition('API_003')?.httpStatus).toBe(404);
    expect(getApiErrorDefinition('API_005')?.httpStatus).toBe(429);
    expect(getApiErrorDefinition('API_013')?.httpStatus).toBe(401);
    expect(getApiErrorDefinition('API_011')?.httpStatus).toBe(503);
    expect(getApiErrorDefinition('API_012')?.httpStatus).toBe(500);
  });

  it('should validate API error codes', () => {
    expect(isApiErrorCode('API_001')).toBe(true);
    expect(isApiErrorCode('API_023')).toBe(true);
    expect(isApiErrorCode('API_099')).toBe(false);
    expect(isApiErrorCode('INVALID')).toBe(false);
  });

  it('should get error definition by code', () => {
    const def = getApiErrorDefinition('API_001');
    expect(def).toBeDefined();
    expect(def?.code).toBe('API_001');
    expect(def?.httpStatus).toBe(400);
    expect(typeof def?.message).toBe('string');
  });

  it('should return undefined for non-existent code', () => {
    const def = getApiErrorDefinition('INVALID');
    expect(def).toBeUndefined();
  });
});

describe('ApiException Class', () => {
  it('should create error with code and status', () => {
    const error = new ApiException('API_001');
    expect(error.code).toBe('API_001');
    expect(error.getStatus()).toBe(400);
    expect(error.httpStatus).toBe(400);
  });

  it('should interpolate parameters into message', () => {
    const error = new ApiException('API_005', {
      limit: 100,
      window: 60,
      retryAfter: 30
    });
    expect(error.message).toContain('100');
    expect(error.message).toContain('60');
    expect(error.message).toContain('30');
  });

  it('should store parameters', () => {
    const params = { limit: 100, window: 60, retryAfter: 30 };
    const error = new ApiException('API_005', params);
    expect(error.parameters).toEqual(params);
  });

  it('should store metadata', () => {
    const metadata = { requestId: 'abc', userId: '123' };
    const error = new ApiException('API_001', {}, metadata);
    expect(error.metadata).toEqual(metadata);
  });

  it('should have timestamp', () => {
    const before = new Date().toISOString();
    const error = new ApiException('API_001');
    const after = new Date().toISOString();
    expect(error.timestamp >= before).toBe(true);
    expect(error.timestamp <= after).toBe(true);
  });

  it('should identify client errors', () => {
    expect(new ApiException('API_001').isClientError()).toBe(true); // 400
    expect(new ApiException('API_003').isClientError()).toBe(true); // 404
    expect(new ApiException('API_005').isClientError()).toBe(true); // 429
    expect(new ApiException('API_011').isClientError()).toBe(false); // 503
  });

  it('should identify server errors', () => {
    expect(new ApiException('API_011').isServerError()).toBe(true); // 503
    expect(new ApiException('API_012').isServerError()).toBe(true); // 500
    expect(new ApiException('API_001').isServerError()).toBe(false); // 400
  });

  it('should identify retryable errors', () => {
    expect(new ApiException('API_005').isRetryable()).toBe(true); // 429
    expect(new ApiException('API_011').isRetryable()).toBe(true); // 503
    expect(new ApiException('API_001').isRetryable()).toBe(false); // 400
  });

  it('should serialize to JSON', () => {
    const error = new ApiException('API_005', {
      limit: 100,
      window: 60,
      retryAfter: 30
    });
    const json = error.toJSON();
    expect(json.code).toBe('API_005');
    expect(json.httpStatus).toBe(429);
    expect(typeof json.message).toBe('string');
    expect(typeof json.timestamp).toBe('string');
  });

  it('should get error definition', () => {
    const error = new ApiException('API_001');
    const def = error.getDefinition();
    expect(def).toBeDefined();
    expect(def?.code).toBe('API_001');
  });

  it('should throw for invalid error code', () => {
    expect(() => new ApiException('INVALID')).toThrow(/not found in API error registry/);
  });

  // Static factory methods tests
  it('should create tenant context missing error', () => {
    const error = ApiException.tenantContextMissing();
    expect(error.code).toBe('API_001');
    expect(error.getStatus()).toBe(400);
  });

  it('should create tenant context invalid error', () => {
    const error = ApiException.tenantContextInvalid();
    expect(error.code).toBe('API_002');
    expect(error.getStatus()).toBe(400);
  });

  it('should create API version not found error', () => {
    const error = ApiException.apiVersionNotFound('v3');
    expect(error.code).toBe('API_003');
    expect(error.getStatus()).toBe(404);
    expect(error.message).toContain('v3');
  });

  it('should create API version deprecated error', () => {
    const error = ApiException.apiVersionDeprecated('v1', '2026-06-30');
    expect(error.code).toBe('API_004');
    expect(error.getStatus()).toBe(400);
    expect(error.message).toContain('v1');
    expect(error.message).toContain('2026-06-30');
  });

  it('should create rate limit exceeded error', () => {
    const error = ApiException.rateLimitExceeded(100, 60, 30);
    expect(error.code).toBe('API_005');
    expect(error.getStatus()).toBe(429);
    expect(error.message).toContain('100');
  });

  it('should create request validation failed error', () => {
    const error = ApiException.requestValidationFailed('email', 'invalid format');
    expect(error.code).toBe('API_006');
    expect(error.getStatus()).toBe(400);
    expect(error.message).toContain('email');
  });

  it('should create invalid query parameter error', () => {
    const error = ApiException.invalidQueryParameter('order', 'invalid');
    expect(error.code).toBe('API_007');
    expect(error.getStatus()).toBe(400);
  });

  it('should create missing required header error', () => {
    const error = ApiException.missingRequiredHeader('authorization');
    expect(error.code).toBe('API_008');
    expect(error.getStatus()).toBe(400);
  });

  it('should create invalid request body format error', () => {
    const error = ApiException.invalidRequestBodyFormat('JSON');
    expect(error.code).toBe('API_009');
    expect(error.getStatus()).toBe(400);
  });

  it('should create feature not enabled error', () => {
    const error = ApiException.featureNotEnabled('analytics');
    expect(error.code).toBe('API_010');
    expect(error.getStatus()).toBe(503);
    expect(error.message).toContain('analytics');
  });

  it('should create service unavailable error', () => {
    const error = ApiException.serviceUnavailable('payment', 60);
    expect(error.code).toBe('API_011');
    expect(error.getStatus()).toBe(503);
    expect(error.message).toContain('payment');
  });

  it('should create configuration error', () => {
    const error = ApiException.configurationError('databaseUrl');
    expect(error.code).toBe('API_012');
    expect(error.getStatus()).toBe(500);
  });

  it('should create invalid API key error', () => {
    const error = ApiException.invalidApiKey('key_123');
    expect(error.code).toBe('API_013');
    expect(error.getStatus()).toBe(401);
    expect(error.message).toContain('key_123');
  });

  it('should create API key expired error', () => {
    const error = ApiException.apiKeyExpired('key_123', '2024-01-01');
    expect(error.code).toBe('API_014');
    expect(error.getStatus()).toBe(401);
  });

  it('should create webhook delivery failed error', () => {
    const error = ApiException.webhookDeliveryFailed('https://example.com', 3, 'timeout');
    expect(error.code).toBe('API_015');
    expect(error.getStatus()).toBe(500);
    expect(error.message).toContain('example.com');
  });

  it('should create batch request too large error', () => {
    const error = ApiException.batchRequestTooLarge(100, 150, 'items');
    expect(error.code).toBe('API_016');
    expect(error.getStatus()).toBe(413);
  });

  it('should create request timeout error', () => {
    const error = ApiException.requestTimeout(30);
    expect(error.code).toBe('API_017');
    expect(error.getStatus()).toBe(408);
  });

  it('should create invalid pagination parameters error', () => {
    const error = ApiException.invalidPaginationParameters(1, 1000, 100);
    expect(error.code).toBe('API_018');
    expect(error.getStatus()).toBe(400);
  });

  it('should create invalid sort parameters error', () => {
    const error = ApiException.invalidSortParameters('invalid', 'desc');
    expect(error.code).toBe('API_019');
    expect(error.getStatus()).toBe(400);
  });

  it('should create concurrent modification conflict error', () => {
    const error = ApiException.concurrentModificationConflict('user', '123');
    expect(error.code).toBe('API_020');
    expect(error.getStatus()).toBe(409);
  });
});

describe('Error Helper Functions (Static Factory Methods)', () => {
  it('should create tenant context missing using ApiException', () => {
    const error = ApiException.tenantContextMissing();
    expect(error.code).toBe('API_001');
    expect(error.getStatus()).toBe(400);
    // Verify it can be thrown
    expect(() => {
      throw error;
    }).toThrow(ApiException);
  });

  it('should create tenant context invalid using ApiException', () => {
    const error = ApiException.tenantContextInvalid();
    expect(error.code).toBe('API_002');
    expect(error.getStatus()).toBe(400);
    // Verify it can be thrown
    expect(() => {
      throw error;
    }).toThrow(ApiException);
  });

  it('should create API version not found using ApiException', () => {
    const error = ApiException.apiVersionNotFound('v5');
    expect(error.code).toBe('API_003');
    expect(error.message).toContain('v5');
    expect(error.getStatus()).toBe(404);
    // Verify it can be thrown
    expect(() => {
      throw error;
    }).toThrow(ApiException);
  });

  it('should create rate limit exceeded using ApiException', () => {
    const error = ApiException.rateLimitExceeded(1000, 300, 60);
    expect(error.code).toBe('API_005');
    expect(error.getStatus()).toBe(429);
    expect(error.message).toContain('1000');
    // Verify it can be thrown
    expect(() => {
      throw error;
    }).toThrow(ApiException);
  });
});

describe('Type Guards (ApiException instance methods)', () => {
  it('should identify client errors using isClientError method', () => {
    const clientError = ApiException.tenantContextMissing();
    expect(clientError.isClientError()).toBe(true);

    const serverError = ApiException.serviceUnavailable('email-service');
    expect(serverError.isClientError()).toBe(false);
  });

  it('should identify server errors using isServerError method', () => {
    const serverError = ApiException.serviceUnavailable('email-service');
    expect(serverError.isServerError()).toBe(true);

    const clientError = ApiException.tenantContextMissing();
    expect(clientError.isServerError()).toBe(false);
  });

  it('should identify retryable errors using isRetryable method', () => {
    const retryableError = ApiException.rateLimitExceeded(1000, 300, 60);
    expect(retryableError.isRetryable()).toBe(true);

    const nonRetryableError = ApiException.tenantContextMissing();
    expect(nonRetryableError.isRetryable()).toBe(false);
  });
});

describe('Error Message Templates', () => {
  it('should have correct message for API_001', () => {
    const error = new ApiException('API_001');
    expect(error.message.toLowerCase()).toContain('tenant');
  });

  it('should have correct message for API_005', () => {
    const error = new ApiException('API_005', {
      limit: 100,
      window: 60,
      retryAfter: 30
    });
    expect(error.message).toContain('100');
    expect(error.message).toContain('60');
    expect(error.message).toContain('30');
  });

  it('should handle missing optional parameters', () => {
    const error = new ApiException('API_005');
    // Should not throw and should have a message
    expect(typeof error.message).toBe('string');
    expect(error.message.length).toBeGreaterThan(0);
  });
});
