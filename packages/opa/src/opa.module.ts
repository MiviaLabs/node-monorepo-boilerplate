/**
 * OPA Module
 *
 * NestJS module for Open Policy Agent (OPA) integration
 */

import { Module, Global, Provider, DynamicModule } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { Reflector } from '@nestjs/core';

import { Resource, Action } from './decorators';
import { OpaGuard, OpaCachedGuard } from './guards';
import { OpaService, OpaError } from './opa.service';

import type { IOpaModuleOptions, IOpaModuleAsyncOptions } from './types';
import type { Observable } from 'rxjs';

/**
 * OPA module tokens
 */
export const OPA_OPTIONS = 'OPA_OPTIONS';
export const OPA_SERVICE = 'OPA_SERVICE';
export const HTTP_SERVICE_TOKEN = 'HTTP_SERVICE_TOKEN';

/**
 * Global OPA module for NestJS
 *
 * This module provides:
 * - Dependency injection for OpaService
 * - OPA authorization guards (OpaGuard, OpaCachedGuard)
 * - Authorization decorators (@Resource, @Action)
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     OpaModule.forRootAsync({
 *       imports: [ConfigModule, HttpModule],
 *       inject: [ConfigService],
 *       useFactory: (config: ConfigService) => ({
 *         url: config.get('OPA_URL', 'http://localhost:8181'),
 *         policyPath: config.get('OPA_POLICY_PATH', '/v1/data/authz/allow'),
 *         timeout: config.get('OPA_TIMEOUT', 5000),
 *       }),
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({
  imports: [],
  providers: [],
  exports: []
})
export class OpaModule {
  /**
   * Configure OPA module with async configuration
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     OpaModule.forRootAsync({
   *       imports: [ConfigModule, HttpModule],
   *       inject: [ConfigService],
   *       useFactory: (config: ConfigService) => ({
   *         url: config.get('OPA_URL', 'http://localhost:8181'),
   *         policyPath: config.get('OPA_POLICY_PATH', '/v1/data/authz/allow'),
   *         timeout: config.get('OPA_TIMEOUT', 5000),
   *       }),
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRootAsync(options: IOpaModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: OPA_OPTIONS,
        useFactory: options.useFactory,
        inject: (options.inject ?? []) as string[]
      },
      {
        provide: HTTP_SERVICE_TOKEN,
        useFactory: (httpService: HttpService) => httpService,
        inject: [HttpService]
      },
      {
        provide: OPA_SERVICE,
        useFactory: (
          httpService: {
            post: (
              url: string,
              data: unknown
            ) => Observable<{ data: { result: boolean; decision_id?: string } }>;
            get: (url: string) => Observable<unknown>;
          },
          config: IOpaModuleOptions
        ) => {
          return new OpaService(httpService, config);
        },
        inject: [HTTP_SERVICE_TOKEN, OPA_OPTIONS]
      }
    ];

    return {
      module: OpaModule,
      imports: [HttpModule, ...(options.imports ?? [])] as never[],
      providers: [
        Reflector,
        ...providers,
        {
          provide: OpaService,
          useExisting: OPA_SERVICE
        },
        OpaGuard,
        OpaCachedGuard
      ],
      exports: [OPA_SERVICE, OpaService, OpaGuard, OpaCachedGuard]
    };
  }

  /**
   * Re-export types and classes for convenience
   */
  static exports = {
    OpaService,
    OpaError,
    OpaGuard,
    OpaCachedGuard,
    Resource,
    Action
  };
}

// Type re-exports (I-prefixed canonical + deprecated aliases)
export type {
  IOpaModuleOptions,
  IOpaModuleAsyncOptions,
  IAuthzRequest,
  IAuthzResponse,
  OpaModuleOptions,
  OpaModuleAsyncOptions,
  AuthzRequest,
  AuthzResponse
} from './types';

// Class and function exports
export { OpaService, OpaError } from './opa.service';
export { OpaGuard, OpaCachedGuard } from './guards';
export { Resource, Action } from './decorators';
