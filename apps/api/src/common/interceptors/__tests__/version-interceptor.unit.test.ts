/**
 * Unit Tests for VersionInterceptor
 *
 * Tests the version interceptor with mocked dependencies.
 */

import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import { VersionInterceptor } from '../version-interceptor';

import type { VersionService } from '../../services/version.service';
import type { ExecutionContext, CallHandler } from '@nestjs/common';

describe('VersionInterceptor', () => {
  let interceptor: VersionInterceptor<unknown>;
  let reflector: Reflector;
  let versionService: jest.Mocked<VersionService>;

  const mockSetHeader = jest.fn();

  const createMockExecutionContext = (url: string): ExecutionContext => {
    const mockResponse = {
      setHeader: mockSetHeader
    };

    const mockRequest = {
      url,
      response: mockResponse
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse
      }),
      getHandler: () => ({}),
      getClass: () => ({})
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (data: unknown): CallHandler => {
    return {
      handle: jest.fn().mockReturnValue(of(data))
    } as unknown as CallHandler;
  };

  beforeEach(() => {
    mockSetHeader.mockClear();

    reflector = new Reflector();
    versionService = {
      getDeprecationInfo: jest.fn()
    } as unknown as jest.Mocked<VersionService>;

    interceptor = new VersionInterceptor(reflector, versionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractVersionFromPath', () => {
    it('should extract v1 from /api/v1/users', () => {
      // Arrange
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v1');
    });

    it('should extract v2 from /api/v2/products', () => {
      // Arrange
      const url = '/api/v2/products';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v2');
    });

    it('should extract v10 from /api/v10/items', () => {
      // Arrange
      const url = '/api/v10/items';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v10');
    });

    it('should extract version from /v1/ format (without /api prefix)', () => {
      // Arrange
      const url = '/v1/users';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v1');
    });

    it('should return null when no version in path', () => {
      // Arrange
      const url = '/api/health';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).not.toHaveBeenCalledWith('X-API-Version', expect.any(String));
    });
  });

  describe('X-API-Version header', () => {
    it('should add X-API-Version header for all versioned requests', () => {
      // Arrange
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v1');
    });
  });

  describe('deprecation headers', () => {
    beforeEach(() => {
      versionService.getDeprecationInfo.mockReturnValue(null);
    });

    it('should add deprecation headers for deprecated versions', () => {
      // Arrange
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);

      const deprecationInfo = {
        deprecated: true,
        sunsetDate: '2026-12-31',
        daysUntilSunset: 180
      };

      versionService.getDeprecationInfo.mockReturnValue(deprecationInfo);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Deprecated', 'true');
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Sunset', '2026-12-31');
      expect(mockSetHeader).toHaveBeenCalledWith(
        'X-API-Deprecation',
        expect.stringContaining('deprecated')
      );
      expect(mockSetHeader).toHaveBeenCalledWith('Sunset', '2026-12-31');
    });

    it('should not add deprecation headers for active versions', () => {
      // Arrange
      const url = '/api/v2/users';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).not.toHaveBeenCalledWith('X-API-Deprecated', expect.any(String));
      expect(mockSetHeader).not.toHaveBeenCalledWith('X-API-Sunset', expect.any(String));
    });

    it('should log deprecation warning', () => {
      // Arrange
      const loggerSpy = jest.spyOn(interceptor['logger'], 'warn').mockImplementation(() => {});
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);

      const deprecationInfo = {
        deprecated: true,
        sunsetDate: '2026-12-31',
        daysUntilSunset: 180
      };

      versionService.getDeprecationInfo.mockReturnValue(deprecationInfo);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Deprecated API version v1'));

      loggerSpy.mockRestore();
    });
  });

  describe('endpoint-specific deprecation', () => {
    beforeEach(() => {
      versionService.getDeprecationInfo.mockReturnValue(null);
    });

    it('should add endpoint deprecation headers when metadata is set', () => {
      // Arrange
      const url = '/api/v1/users';
      const handler = { name: 'testHandler' };
      const context = {
        ...createMockExecutionContext(url),
        getHandler: () => handler
      } as unknown as ExecutionContext;

      const endpointDeprecation = {
        deprecated: true,
        reason: 'Use POST /api/v2/users instead',
        migrationGuide: 'https://docs.example.com/migration'
      };

      jest.spyOn(reflector, 'get').mockReturnValue(endpointDeprecation);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith('X-Endpoint-Deprecated', 'true');
      expect(mockSetHeader).toHaveBeenCalledWith(
        'X-Endpoint-Deprecation',
        expect.stringContaining('Use POST /api/v2/users instead')
      );
    });
  });

  describe('response enrichment', () => {
    beforeEach(() => {
      versionService.getDeprecationInfo.mockReturnValue(null);
    });

    it('should enrich response with version metadata for deprecated version', (done) => {
      // Arrange
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);
      const responseData = { id: 1, name: 'Test' };

      const deprecationInfo = {
        deprecated: true,
        sunsetDate: '2026-12-31',
        daysUntilSunset: 180
      };

      versionService.getDeprecationInfo.mockReturnValue(deprecationInfo);

      // Act
      interceptor.intercept(context, createMockCallHandler(responseData)).subscribe((result) => {
        // Assert
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('meta');
        expect(result.meta).toHaveProperty('version', 'v1');
        expect(result.meta).toHaveProperty('deprecated', true);
        expect(result.meta).toHaveProperty('sunset', '2026-12-31');
        done();
      });
    });

    it('should not enrich response with version metadata for active version', (done) => {
      // Arrange
      const url = '/api/v2/users';
      const context = createMockExecutionContext(url);
      const responseData = { id: 1, name: 'Test' };

      // Act
      interceptor.intercept(context, createMockCallHandler(responseData)).subscribe((result) => {
        // Assert
        expect(result).toHaveProperty('data');
        expect(result.data).toEqual(responseData);
        done();
      });
    });

    it('should handle null data response', (done) => {
      // Arrange
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);

      const deprecationInfo = {
        deprecated: true,
        sunsetDate: '2026-12-31'
      };

      versionService.getDeprecationInfo.mockReturnValue(deprecationInfo);

      // Act
      interceptor.intercept(context, createMockCallHandler(null)).subscribe((result) => {
        // Assert
        expect(result).toHaveProperty('data', null);
        expect(result.meta).toHaveProperty('deprecated', true);
        done();
      });
    });

    it('should handle array data response', (done) => {
      // Arrange
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);
      const responseData = [{ id: 1 }, { id: 2 }];

      const deprecationInfo = {
        deprecated: true,
        sunsetDate: '2026-12-31'
      };

      versionService.getDeprecationInfo.mockReturnValue(deprecationInfo);

      // Act
      interceptor.intercept(context, createMockCallHandler(responseData)).subscribe((result) => {
        // Assert
        expect(result).toHaveProperty('data');
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.meta).toHaveProperty('deprecated', true);
        done();
      });
    });

    it('wraps DTOs that have a business metadata field instead of stripping them', (done) => {
      const url = '/api/v1/storage/files/101';
      const context = createMockExecutionContext(url);
      const responseData = {
        id: 101,
        status: 'ready',
        metadata: {
          source: 'storage'
        }
      };

      interceptor.intercept(context, createMockCallHandler(responseData)).subscribe((result) => {
        expect(result).toHaveProperty('data');
        expect(result.data).toEqual(responseData);
        done();
      });
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockSetHeader.mockClear();
    });

    it('should log error and continue when getDeprecationInfo throws', () => {
      // Arrange
      const loggerSpy = jest.spyOn(interceptor['logger'], 'error').mockImplementation(() => {});
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);

      versionService.getDeprecationInfo.mockImplementation(() => {
        throw new Error('Service error');
      });

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy.mock.calls[0]?.[0]).toContain('Failed to get deprecation info');
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v1');
      // Should still process the request
      expect(mockSetHeader).toHaveBeenCalled();

      loggerSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      versionService.getDeprecationInfo.mockReturnValue(null);
    });

    it('should handle version without /api prefix', () => {
      // Arrange
      const url = '/v1/health';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'ok' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v1');
    });

    it('should handle requests without version', () => {
      // Arrange
      const url = '/health';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'ok' })).subscribe();

      // Assert
      expect(mockSetHeader).not.toHaveBeenCalledWith('X-API-Version', expect.any(String));
    });

    it('should handle malformed URL gracefully', () => {
      // Arrange
      const url = '/api/invalid/users';
      const context = createMockExecutionContext(url);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).not.toHaveBeenCalledWith('X-API-Version', expect.any(String));
    });
  });

  describe('Link header', () => {
    beforeEach(() => {
      versionService.getDeprecationInfo.mockReturnValue(null);
    });

    it('should add Link header for deprecated versions', () => {
      // Arrange
      const url = '/api/v1/users';
      const context = createMockExecutionContext(url);

      const deprecationInfo = {
        deprecated: true,
        sunsetDate: '2026-12-31'
      };

      versionService.getDeprecationInfo.mockReturnValue(deprecationInfo);

      // Act
      interceptor.intercept(context, createMockCallHandler({ data: 'test' })).subscribe();

      // Assert
      expect(mockSetHeader).toHaveBeenCalledWith(
        'Link',
        expect.stringContaining('</api/docs>; rel="service-doc"')
      );
      expect(mockSetHeader).toHaveBeenCalledWith(
        'Link',
        expect.stringContaining('</api/v1/docs>; rel="version-history"')
      );
    });
  });
});
