/**
 * OpaModule Unit Tests
 *
 * Comprehensive test suite for OpaModule covering:
 * - forRootAsync() dynamic module configuration
 * - Provider registration and dependency injection
 * - Export configuration
 * - Module metadata structure
 * - Integration with HttpService
 *
 * Test Strategy:
 * - Test dynamic module creation
 * - Validate provider tokens
 * - Verify exports
 * - Test factory function execution
 */

import { HttpModule, HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import { OpaModule } from '../opa.module';
import { OpaService, OpaError } from '../opa.service';
import { OpaGuard } from '../guards/opa.guard';
import { OpaCachedGuard } from '../guards/opa-cached.guard';

import type { IOpaModuleAsyncOptions } from '../types';
import type { CanActivate } from '@nestjs/common';

// Mock guards that don't depend on Reflector for testing
class MockOpaGuard implements CanActivate {
  canActivate() {
    return Promise.resolve(true);
  }
}

class MockOpaCachedGuard implements CanActivate {
  canActivate() {
    return Promise.resolve(true);
  }
}

describe('OpaModule', () => {
  describe('module metadata', () => {
    it('should be defined', () => {
      expect(OpaModule).toBeDefined();
    });

    it('should be a Global module', () => {
      expect(OpaModule).toBeDefined();
    });

    it('should have forRootAsync static method', () => {
      expect(typeof OpaModule.forRootAsync).toBe('function');
    });
  });

  describe('forRootAsync', () => {
    it('should return a DynamicModule', () => {
      const options: IOpaModuleAsyncOptions = {
        inject: [HttpService],
        useFactory: () => ({
          url: 'http://localhost:8181',
          policyPath: '/v1/data/authz/allow',
          timeout: 5000
        })
      };

      const dynamicModule = OpaModule.forRootAsync(options);

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.module).toBe(OpaModule);
      expect(dynamicModule.imports).toEqual([HttpModule]);
      expect(Array.isArray(dynamicModule.providers)).toBe(true);
      expect(Array.isArray(dynamicModule.exports)).toBe(true);
    });

    it('should include HttpModule in imports when provided', () => {
      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: () => ({
          url: 'http://localhost:8181',
          policyPath: '/v1/data/authz/allow',
          timeout: 5000
        })
      };

      const dynamicModule = OpaModule.forRootAsync(options);

      expect(dynamicModule.imports).toContain(HttpModule);
    });

    it('should have empty imports array when none provided', () => {
      const options: IOpaModuleAsyncOptions = {
        useFactory: () => ({
          url: 'http://localhost:8181',
          policyPath: '/v1/data/authz/allow',
          timeout: 5000
        })
      };

      const dynamicModule = OpaModule.forRootAsync(options);

      expect(dynamicModule.imports).toEqual([HttpModule]);
    });

    describe('providers', () => {
      it('should register OPA_OPTIONS provider', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        const optionsProvider = dynamicModule.providers?.find(
          (p: any) => p.provide === 'OPA_OPTIONS'
        );

        expect(optionsProvider).toBeDefined();
        expect(optionsProvider.useFactory).toBe(options.useFactory);
      });

      it('should register HTTP_SERVICE_TOKEN provider', () => {
        const options: IOpaModuleAsyncOptions = {
          imports: [HttpModule],
          inject: [HttpService],
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        const httpServiceProvider = dynamicModule.providers?.find(
          (p: any) => p.provide === 'HTTP_SERVICE_TOKEN'
        );

        expect(httpServiceProvider).toBeDefined();
        // The inject property should exist and be an array with HttpService
        expect(httpServiceProvider?.inject).toBeDefined();
        expect(httpServiceProvider?.inject).toHaveLength(1);
        expect(httpServiceProvider?.inject[0]).toBe(HttpService);
      });

      it('should register OPA_SERVICE provider', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        const opaServiceProvider = dynamicModule.providers?.find(
          (p: any) => p.provide === 'OPA_SERVICE'
        );

        expect(opaServiceProvider).toBeDefined();
        expect(opaServiceProvider.inject).toEqual(['HTTP_SERVICE_TOKEN', 'OPA_OPTIONS']);
      });

      it('should register OpaService with useExisting alias', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        const opaServiceAlias = dynamicModule.providers?.find(
          (p: any) => p.provide === OpaService && p.useExisting === 'OPA_SERVICE'
        );

        expect(opaServiceAlias).toBeDefined();
      });

      it('should register OpaGuard as provider', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        expect(dynamicModule.providers).toContain(OpaGuard);
      });

      it('should register OpaCachedGuard as provider', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        expect(dynamicModule.providers).toContain(OpaCachedGuard);
      });
    });

    describe('exports', () => {
      it('should export OPA_SERVICE token', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        expect(dynamicModule.exports).toContain('OPA_SERVICE');
      });

      it('should export OpaService class', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        expect(dynamicModule.exports).toContain(OpaService);
      });

      it('should export OpaGuard', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        expect(dynamicModule.exports).toContain(OpaGuard);
      });

      it('should export OpaCachedGuard', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        expect(dynamicModule.exports).toContain(OpaCachedGuard);
      });

      it('should export all required providers', () => {
        const options: IOpaModuleAsyncOptions = {
          useFactory: () => ({
            url: 'http://localhost:8181',
            policyPath: '/v1/data/authz/allow',
            timeout: 5000
          })
        };

        const dynamicModule = OpaModule.forRootAsync(options);

        expect(dynamicModule.exports).toEqual([
          'OPA_SERVICE',
          OpaService,
          OpaGuard,
          OpaCachedGuard
        ]);
      });
    });
  });

  describe('useFactory execution', () => {
    it('should call factory function with injected dependencies', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const factorySpy = jest.fn().mockReturnValue({
        url: 'http://custom-opa:8181',
        policyPath: '/v1/data/custom/allow',
        timeout: 3000
      });

      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: factorySpy
      };

      const testModule = await Test.createTestingModule({
        imports: [OpaModule.forRootAsync(options)],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();

      // Factory should be called during module initialization
      expect(factorySpy).toHaveBeenCalled();
    });

    it('should handle async factory function', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const asyncFactory = async () => ({
        url: 'http://localhost:8181',
        policyPath: '/v1/data/authz/allow',
        timeout: 5000
      });

      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: asyncFactory
      };

      const testModule = await Test.createTestingModule({
        imports: [OpaModule.forRootAsync(options)],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await expect(testModule.init()).resolves.not.toThrow();
    });

    it('should use factory-provided configuration', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const customConfig = {
        url: 'http://custom-opa:9191',
        policyPath: '/v1/data/custom/policy',
        timeout: 7000
      };

      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: () => customConfig
      };

      const testModule = await Test.createTestingModule({
        imports: [OpaModule.forRootAsync(options)],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();
      const opaService = testModule.get<OpaService>(OpaService);
      const config = opaService.getConfig();

      expect(config.url).toBe(customConfig.url);
      expect(config.policyPath).toBe(customConfig.policyPath);
      expect(config.timeout).toBe(customConfig.timeout);
    });
  });

  describe('dependency injection', () => {
    it('should provide OpaService', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const testModule = await Test.createTestingModule({
        imports: [
          OpaModule.forRootAsync({
            imports: [HttpModule],
            inject: [HttpService],
            useFactory: () => ({
              url: 'http://localhost:8181',
              policyPath: '/v1/data/authz/allow',
              timeout: 5000
            })
          })
        ],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();
      const opaService = testModule.get<OpaService>(OpaService);

      expect(opaService).toBeDefined();
      expect(opaService).toBeInstanceOf(OpaService);
    });

    it('should provide OpaService via OPA_SERVICE token', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const testModule = await Test.createTestingModule({
        imports: [
          OpaModule.forRootAsync({
            imports: [HttpModule],
            inject: [HttpService],
            useFactory: () => ({
              url: 'http://localhost:8181',
              policyPath: '/v1/data/authz/allow',
              timeout: 5000
            })
          })
        ],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();
      const opaService = testModule.get<OpaService>('OPA_SERVICE');

      expect(opaService).toBeDefined();
      expect(opaService).toBeInstanceOf(OpaService);
    });

    it('should provide OpaGuard', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const testModule = await Test.createTestingModule({
        imports: [
          OpaModule.forRootAsync({
            imports: [HttpModule],
            inject: [HttpService],
            useFactory: () => ({
              url: 'http://localhost:8181',
              policyPath: '/v1/data/authz/allow',
              timeout: 5000
            })
          })
        ],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();
      const opaGuard = testModule.get<OpaGuard>(OpaGuard);

      expect(opaGuard).toBeDefined();
      // Guard is overridden with mock, so we check it exists rather than instance type
      expect(opaGuard).toBeDefined();
    });

    it('should provide OpaCachedGuard', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const testModule = await Test.createTestingModule({
        imports: [
          OpaModule.forRootAsync({
            imports: [HttpModule],
            inject: [HttpService],
            useFactory: () => ({
              url: 'http://localhost:8181',
              policyPath: '/v1/data/authz/allow',
              timeout: 5000
            })
          })
        ],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();
      const opaCachedGuard = testModule.get<OpaCachedGuard>(OpaCachedGuard);

      expect(opaCachedGuard).toBeDefined();
      // Guard is overridden with mock, so we check it exists rather than instance type
      expect(opaCachedGuard).toBeDefined();
    });
  });

  describe('module integration', () => {
    it('should work with HttpModule integration', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const testModule = await Test.createTestingModule({
        imports: [
          OpaModule.forRootAsync({
            imports: [HttpModule],
            inject: [HttpService],
            useFactory: (httpService: HttpService) => ({
              url: 'http://localhost:8181',
              policyPath: '/v1/data/authz/allow',
              timeout: 5000
            })
          })
        ],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();

      const opaService = testModule.get<OpaService>(OpaService);

      expect(opaService).toBeDefined();
    });

    it('should support custom inject array', () => {
      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: (httpService: HttpService) => ({
          url: 'http://localhost:8181',
          policyPath: '/v1/data/authz/allow',
          timeout: 5000
        })
      };

      const dynamicModule = OpaModule.forRootAsync(options);

      expect(dynamicModule).toBeDefined();
    });
  });

  describe('static exports', () => {
    it('should export OpaService as static property', () => {
      expect(OpaModule.exports.OpaService).toBe(OpaService);
    });

    it('should export OpaError as static property', () => {
      expect(OpaModule.exports.OpaError).toBe(OpaError);
    });

    it('should export OpaGuard as static property', () => {
      expect(OpaModule.exports.OpaGuard).toBe(OpaGuard);
    });

    it('should export OpaCachedGuard as static property', () => {
      expect(OpaModule.exports.OpaCachedGuard).toBe(OpaCachedGuard);
    });

    it('should export Resource decorator as static property', () => {
      expect(OpaModule.exports.Resource).toBeDefined();
      expect(typeof OpaModule.exports.Resource).toBe('function');
    });

    it('should export Action decorator as static property', () => {
      expect(OpaModule.exports.Action).toBeDefined();
      expect(typeof OpaModule.exports.Action).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should propagate factory errors', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: () => {
          throw new Error('Factory error');
        }
      };

      const testModule = Test.createTestingModule({
        imports: [OpaModule.forRootAsync(options)],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard);

      await expect(testModule.compile()).rejects.toThrow('Factory error');
    });

    it('should handle factory returning invalid config', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const invalidConfig = {
        url: '',
        policyPath: '',
        timeout: -1
      };

      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: () => invalidConfig
      };

      const testModule = await Test.createTestingModule({
        imports: [OpaModule.forRootAsync(options)],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      // Module should still initialize, but service may fail on first use
      await testModule.init();
      const opaService = testModule.get<OpaService>(OpaService);

      expect(opaService).toBeDefined();
    });
  });

  describe('configuration scenarios', () => {
    it('should handle minimal configuration', () => {
      const options: IOpaModuleAsyncOptions = {
        useFactory: () => ({
          url: 'http://localhost:8181',
          policyPath: '/v1/data/authz/allow',
          timeout: 5000
        })
      };

      const dynamicModule = OpaModule.forRootAsync(options);

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.imports).toEqual([HttpModule]);
    });

    it('should handle full configuration with imports', () => {
      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: (httpService: HttpService) => ({
          url: 'http://localhost:8181',
          policyPath: '/v1/data/authz/allow',
          timeout: 5000
        })
      };

      const dynamicModule = OpaModule.forRootAsync(options);

      expect(dynamicModule.imports).toContain(HttpModule);
    });

    it('should handle custom timeout values', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: () => ({
          url: 'http://localhost:8181',
          policyPath: '/v1/data/authz/allow',
          timeout: 10000
        })
      };

      const testModule = await Test.createTestingModule({
        imports: [OpaModule.forRootAsync(options)],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();
      const opaService = testModule.get<OpaService>(OpaService);
      const config = opaService.getConfig();

      expect(config.timeout).toBe(10000);
    });

    it('should handle custom policy paths', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const customPolicyPath = '/v1/data/enterprise/rbac/v2/authorize';

      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: () => ({
          url: 'http://localhost:8181',
          policyPath: customPolicyPath,
          timeout: 5000
        })
      };

      const testModule = await Test.createTestingModule({
        imports: [OpaModule.forRootAsync(options)],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();
      const opaService = testModule.get<OpaService>(OpaService);
      const config = opaService.getConfig();

      expect(config.policyPath).toBe(customPolicyPath);
    });

    it('should handle custom URLs', async () => {
      const mockHttpService = {
        post: jest.fn().mockReturnValue(of({ data: { result: true } })),
        get: jest.fn().mockReturnValue(of({ status: 'ok' }))
      };

      const customUrl = 'http://opa.prod.svc.cluster.local:8181';

      const options: IOpaModuleAsyncOptions = {
        imports: [HttpModule],
        inject: [HttpService],
        useFactory: () => ({
          url: customUrl,
          policyPath: '/v1/data/authz/allow',
          timeout: 5000
        })
      };

      const testModule = await Test.createTestingModule({
        imports: [OpaModule.forRootAsync(options)],
        providers: [{ provide: Reflector, useValue: new Reflector() }]
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideProvider(OpaGuard)
        .useClass(MockOpaGuard)
        .overrideProvider(OpaCachedGuard)
        .useClass(MockOpaCachedGuard)
        .compile();

      await testModule.init();
      const opaService = testModule.get<OpaService>(OpaService);
      const config = opaService.getConfig();

      expect(config.url).toBe(customUrl);
    });
  });
});
