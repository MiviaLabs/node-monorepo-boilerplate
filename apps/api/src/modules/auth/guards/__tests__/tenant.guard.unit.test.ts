/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../public.decorator';
import { TenantGuard } from '../tenant.guard';

import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '@/common/errors';

/**
 * Create a mock execution context for testing
 */
function createMockExecutionContext(overrides: {
  handler?: unknown;
  classRef?: unknown;
  request?: Partial<Request>;
}): ExecutionContext {
  return {
    getHandler: () => overrides.handler ?? (() => {}),
    getClass: () => overrides.classRef ?? class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        ...overrides.request
      })
    })
  } as unknown as ExecutionContext;
}

/**
 * Unit tests for TenantGuard
 *
 * Tests the global tenant validation guard that:
 * 1. Bypasses validation for routes marked with @Public() decorator
 * 2. Validates x-tenant-id header for protected routes
 * 3. Throws appropriate errors for missing/invalid tenant IDs
 */
describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new TenantGuard(reflector);
  });

  describe('Public routes (@Public() decorator)', () => {
    it('should allow access when handler has @Public() decorator', () => {
      const context = createMockExecutionContext({
        request: { headers: {} }, // No x-tenant-id header
        handler: () => ({}),
        classRef: class TestController {}
      });

      // Mock reflector to return true for IS_PUBLIC_KEY
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass()
      ]);
    });

    it('should allow access when class has @Public() decorator', () => {
      const context = createMockExecutionContext({
        request: { headers: {} }, // No x-tenant-id header
        handler: () => ({}),
        classRef: class TestController {}
      });

      // Mock reflector to return true for IS_PUBLIC_KEY
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access without x-tenant-id header when @Public()', () => {
      const context = createMockExecutionContext({
        request: { headers: {} } // No x-tenant-id header
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('Swagger docs path bypass (latent foot-gun)', () => {
    /**
     * Bug API-1: TenantGuard.publicPaths = ['/docs', '/api/docs'] uses
     * startsWith('/docs') which is a *prefix* match with no segment boundary.
     * Routes named /docs-internal, /documentation, /docs-anything would
     * silently bypass tenant validation. Replace with exact-match or
     * /docs/, /api/docs/ segment check.
     */
    it('rejects /docs-internal (prefix-match foot-gun) and still requires tenant', () => {
      const context = createMockExecutionContext({
        request: {
          url: '/docs-internal/something',
          headers: {} // No x-tenant-id
        }
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // /docs-internal should NOT be treated as a public Swagger path.
      // It must require the x-tenant-id header like any other protected route.
      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({ code: 'API_008' })
      );
    });

    it('rejects /api/docs-internal and still requires tenant', () => {
      const context = createMockExecutionContext({
        request: {
          url: '/api/docs-internal/foo',
        headers: {}
        }
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
    });

    it('rejects /api/v1/docsfoo (no separator before non-docs suffix)', () => {
      const context = createMockExecutionContext({
        request: {
          url: '/api/v1/docsfoo',
          headers: {}
        }
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
    });

    it('still bypasses tenant validation for the exact /docs path', () => {
      const context = createMockExecutionContext({
        request: {
          url: '/docs',
          headers: {}
        }
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('still bypasses tenant validation for /api/docs (exact)', () => {
      const context = createMockExecutionContext({
        request: {
          url: '/api/docs',
          headers: {}
        }
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('still bypasses for nested Swagger asset paths like /docs/swagger-ui.css', () => {
      const context = createMockExecutionContext({
        request: {
          url: '/docs/swagger-ui.css',
          headers: {}
        }
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('Protected routes (tenant validation required)', () => {
    it('should throw API_008 when x-tenant-id header is missing', () => {
      const context = createMockExecutionContext({
        request: { headers: {} } // No x-tenant-id header
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_008'
        })
      );
    });

    it('should throw API_008 when x-tenant-id header is undefined', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': undefined } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_008'
        })
      );
    });

    it('should throw API_023 when tenant ID is zero', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '0' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_023'
        })
      );
    });

    it('should throw API_023 when tenant ID is negative', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '-1' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_023'
        })
      );
    });

    it('should throw API_023 when tenant ID is non-numeric', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': 'abc' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_023'
        })
      );
    });

    it('should throw API_023 when tenant ID contains special characters', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '123-abc' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_023'
        })
      );
    });

    it('should throw API_023 when tenant ID is floating point number', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '123.45' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_023'
        })
      );
    });

    it('should throw API_008 when tenant ID is empty string', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_008'
        })
      );
    });

    it('should throw API_023 when tenant ID is whitespace', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '   ' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_023'
        })
      );
    });
  });

  describe('Valid tenant ID acceptance', () => {
    it('should accept valid positive integer tenant ID', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '123' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should accept tenant ID = 1', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '1' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should accept large valid tenant ID', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '999999' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('Array header handling', () => {
    it('should use first value when header is array with single value', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': ['123'] } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should use first value when header is array with multiple values', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': ['123', '456'] } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should reject when header is array with empty string as first value', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': ['', '123'] } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_008'
        })
      );
    });

    it('should reject when header is array with invalid first value', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': ['abc', '123'] } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          code: 'API_023'
        })
      );
    });
  });

  describe('Reflector integration', () => {
    it('should check handler metadata first', () => {
      const handler = (): void => {};
      const classRef = class TestController {};
      const context = createMockExecutionContext({ handler, classRef });

      const reflectorSpy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      guard.canActivate(context);

      expect(reflectorSpy).toHaveBeenCalledWith(IS_PUBLIC_KEY, [handler, classRef]);
    });

    it('should bypass tenant validation when reflector returns true', () => {
      const context = createMockExecutionContext({
        request: { headers: {} } // No tenant header
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should enforce tenant validation when reflector returns false', () => {
      const context = createMockExecutionContext({
        request: { headers: {} } // No tenant header
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow(ApiException);
    });
  });

  describe('Edge cases', () => {
    it('should handle numeric string with leading zeros', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '00123' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should handle numeric string with trailing spaces (trimmed before parse)', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': '123 ' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Spaces are trimmed, so this should pass
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle numeric string with leading spaces (trimmed before parse)', () => {
      const context = createMockExecutionContext({
        request: { headers: { 'x-tenant-id': ' 123' } }
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Spaces are trimmed, so this should pass
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
