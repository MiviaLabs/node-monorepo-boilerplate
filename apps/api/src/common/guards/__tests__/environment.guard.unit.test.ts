/**
 * Unit Tests for EnvironmentGuard
 *
 * Tests the environment guard with mocked ExecutionContext and Reflector.
 */

import { Reflector } from '@nestjs/core';

import { EnvironmentGuard } from '../environment.guard';

import type { ExecutionContext } from '@nestjs/common';

describe('EnvironmentGuard', () => {
  let guard: EnvironmentGuard;
  let reflector: Reflector;

  const createMockExecutionContext = (
    classMetadata?: Record<string, unknown>
  ): ExecutionContext => {
    return {
      getClass: () => ({
        ...classMetadata
      }),
      getHandler: () => ({})
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new EnvironmentGuard(reflector);
  });

  afterEach(() => {
    // Reset NODE_ENV after each test
    delete process.env['NODE_ENV'];
  });

  describe('with metadata', () => {
    it('should allow access when current environment is in allowed list', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['development', 'test'] });
      process.env['NODE_ENV'] = 'development';

      jest.spyOn(reflector, 'get').mockReturnValue(['development', 'test']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow access with case-insensitive comparison', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['DEVELOPMENT'] });
      process.env['NODE_ENV'] = 'development';

      jest.spyOn(reflector, 'get').mockReturnValue(['DEVELOPMENT']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should block access when current environment is not in allowed list', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['development', 'test'] });
      process.env['NODE_ENV'] = 'production';

      jest.spyOn(reflector, 'get').mockReturnValue(['development', 'test']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
    });

    it('should block access and log warning when environment not allowed', () => {
      // Arrange
      const loggerSpy = jest.spyOn(guard['logger'], 'warn').mockImplementation(() => {});
      const context = createMockExecutionContext({ environments: ['development'] });
      process.env['NODE_ENV'] = 'production';

      jest.spyOn(reflector, 'get').mockReturnValue(['development']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('production'));
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('development'));

      loggerSpy.mockRestore();
    });
  });

  describe('without metadata (default behavior)', () => {
    it('should allow access in development environment', () => {
      // Arrange
      const context = createMockExecutionContext({});
      process.env['NODE_ENV'] = 'development';

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow access in test environment', () => {
      // Arrange
      const context = createMockExecutionContext({});
      process.env['NODE_ENV'] = 'test';

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should block access in production environment with default metadata', () => {
      // Arrange
      const context = createMockExecutionContext({});
      process.env['NODE_ENV'] = 'production';

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('NODE_ENV not set', () => {
    it('should default to development environment', () => {
      // Arrange
      const context = createMockExecutionContext({});
      delete process.env['NODE_ENV'];

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true); // 'development' is in default ['development', 'test']
    });
  });

  describe('various environments', () => {
    it('should allow staging environment when in allowed list', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['staging'] });
      process.env['NODE_ENV'] = 'staging';

      jest.spyOn(reflector, 'get').mockReturnValue(['staging']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow production environment when explicitly allowed', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['production'] });
      process.env['NODE_ENV'] = 'production';

      jest.spyOn(reflector, 'get').mockReturnValue(['production']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle multiple allowed environments', () => {
      // Arrange
      const context = createMockExecutionContext({
        environments: ['development', 'staging', 'production']
      });
      process.env['NODE_ENV'] = 'staging';

      jest.spyOn(reflector, 'get').mockReturnValue(['development', 'staging', 'production']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle uppercase NODE_ENV', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['development'] });
      process.env['NODE_ENV'] = 'DEVELOPMENT';

      jest.spyOn(reflector, 'get').mockReturnValue(['development']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle mixed case NODE_ENV', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['Development'] });
      process.env['NODE_ENV'] = 'DeVeLoPmEnT';

      jest.spyOn(reflector, 'get').mockReturnValue(['Development']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle empty environments array (block all)', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: [] });
      process.env['NODE_ENV'] = 'development';

      jest.spyOn(reflector, 'get').mockReturnValue([]);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('reflector integration', () => {
    it('should call reflector.get with correct parameters', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['development'] });
      process.env['NODE_ENV'] = 'development';

      const reflectSpy = jest.spyOn(reflector, 'get').mockReturnValue(['development']);

      // Act
      guard.canActivate(context);

      // Assert
      expect(reflectSpy).toHaveBeenCalledWith('environments', expect.any(Object));
    });

    it('should use class metadata for environments', () => {
      // Arrange
      const classMetadata = { environments: ['test'] };
      const context = createMockExecutionContext(classMetadata);
      process.env['NODE_ENV'] = 'test';

      jest.spyOn(reflector, 'get').mockImplementation((key) => {
        if (key === 'environments') {
          return classMetadata.environments as unknown as string[];
        }
        return undefined;
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('security scenarios', () => {
    it('should protect production endpoints from development access', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['production'] });
      process.env['NODE_ENV'] = 'development';

      jest.spyOn(reflector, 'get').mockReturnValue(['production']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
    });

    it('should protect test-only endpoints from production access', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['test'] });
      process.env['NODE_ENV'] = 'production';

      jest.spyOn(reflector, 'get').mockReturnValue(['test']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
    });

    it('should allow development-only endpoints in development', () => {
      // Arrange
      const context = createMockExecutionContext({ environments: ['development'] });
      process.env['NODE_ENV'] = 'development';

      jest.spyOn(reflector, 'get').mockReturnValue(['development']);

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('logging', () => {
    it('should log warning when blocking access', () => {
      // Arrange
      const loggerSpy = jest.spyOn(guard['logger'], 'warn').mockImplementation(() => {});
      const context = createMockExecutionContext({ environments: ['test'] });
      process.env['NODE_ENV'] = 'production';

      jest.spyOn(reflector, 'get').mockReturnValue(['test']);

      // Act
      guard.canActivate(context);

      // Assert
      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('EnvironmentGuard blocked access')
      );

      loggerSpy.mockRestore();
    });

    it('should not log when allowing access', () => {
      // Arrange
      const loggerSpy = jest.spyOn(guard['logger'], 'warn').mockImplementation(() => {});
      const context = createMockExecutionContext({ environments: ['development'] });
      process.env['NODE_ENV'] = 'development';

      jest.spyOn(reflector, 'get').mockReturnValue(['development']);

      // Act
      guard.canActivate(context);

      // Assert
      expect(loggerSpy).not.toHaveBeenCalled();

      loggerSpy.mockRestore();
    });
  });
});
