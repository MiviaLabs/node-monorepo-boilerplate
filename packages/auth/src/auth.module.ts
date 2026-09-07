/**
 * Auth Module
 *
 * NestJS module for authentication infrastructure
 */

import { Module, Global } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { validateAuthConfig, DEFAULT_TOKEN_STORAGE_CONFIG } from './config/auth-config';
import { AuthenticationError } from './errors';
import {
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
  EnhancedPermissionsGuard
} from './guards/index';
import {
  authProviderFactory,
  type IAuthProvider,
  type AuthProviderConfig
} from './providers/factory';
import { AuthService } from './services/auth.service';
import { JwtService } from './services/jwt.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import type { AuthModuleConfig } from './config/auth-config';
import type { OnModuleInit, OnApplicationShutdown, DynamicModule, Provider } from '@nestjs/common';

/**
 * Auth module tokens
 */
export const AUTH_SERVICE = 'AUTH_SERVICE';
export const AUTH_PROVIDER_FACTORY = 'AUTH_PROVIDER_FACTORY';
export const JWT_SERVICE = 'JWT_SERVICE';
export const TOKEN_SERVICE = 'TOKEN_SERVICE';

/**
 * Auth module configuration
 */
export interface AuthModuleOptions {
  /** Auth provider configurations */
  providers: AuthProviderConfig[];
  /** Token storage configuration */
  tokenStorage?: {
    enabled?: boolean;
    enableRotation?: boolean;
    enableBlacklisting?: boolean;
    refreshTokenExpiration?: number;
    sessionExpiration?: number;
  };
  /** JWT configuration */
  jwt?: {
    secretOrKey: string;
    algorithms?: ('HS256' | 'RS256' | 'ES256' | 'PS256')[];
    issuer?: string;
    audience?: string;
    ignoreExpiration?: boolean;
  };
}

/**
 * Global auth module for NestJS
 *
 * This module provides:
 * - Dependency injection for AuthService
 * - Automatic auth provider initialization
 * - Passport JWT strategy
 * - Auth guards (JwtAuthGuard, RolesGuard, PermissionsGuard)
 * - Auth decorators (@Public, @Roles, @RequirePermissions, @User, @ActorId)
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     AuthModule.forRoot({
 *       providers: [
 *         keycloakAuthConfig({
 *           default: true,
 *         }),
 *       ],
 *       jwt: {
 *         secretOrKey: process.env['JWT_SECRET'],
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 *
 * @Injectable()
 * export class UsersService {
 *   constructor(
 *     private readonly auth: AuthService,
 *   ) {}
 *
 *   async authenticateUser(username: string, password: string) {
 *     return this.auth.authenticate({ username, password });
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [
    // Provide services as injectable singletons
    {
      provide: TOKEN_SERVICE,
      useClass: TokenService
    },
    {
      provide: JWT_SERVICE,
      useClass: JwtService
    }
  ],
  exports: []
})
export class AuthModule implements OnModuleInit, OnApplicationShutdown {
  /**
   * Initialize module on startup
   */
  async onModuleInit(): Promise<void> {
    // Module initialization is now handled in forRoot/forRootAsync factories
  }

  /**
   * Cleanup on shutdown
   */
  async onApplicationShutdown(): Promise<void> {
    // Use the global factory reference for cleanup
    authProviderFactory.clearProviders();
  }

  /**
   * Health check for all auth providers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    return authProviderFactory.healthCheckAll();
  }

  /**
   * Get an auth provider by name
   */
  getProvider(name?: string): IAuthProvider | undefined {
    if (!name) return undefined;
    return authProviderFactory.getProvider(name);
  }

  /**
   * Get the default auth provider
   */
  getDefaultProvider(): IAuthProvider | undefined {
    return authProviderFactory.getDefaultProvider();
  }

  /**
   * Configure auth module
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     AuthModule.forRoot({
   *       providers: [
   *         keycloakAuthConfig({ default: true }),
   *       ],
   *       jwt: {
   *         secretOrKey: process.env['JWT_SECRET'],
   *       },
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(options: AuthModuleOptions): DynamicModule {
    validateAuthConfig(options as AuthModuleConfig);

    const providers: Provider[] = [
      {
        provide: AUTH_PROVIDER_FACTORY,
        useValue: authProviderFactory
      },
      {
        provide: AUTH_SERVICE,
        useFactory: async (providerFactory: typeof authProviderFactory) => {
          // Initialize providers
          providerFactory.clearProviders();
          const config = options as AuthModuleConfig;
          // CRITICAL: Must await registration since registerProviderConfigs is async
          await providerFactory.registerProviderConfigs(config.providers);

          const defaultProvider = providerFactory.getDefaultProvider();
          if (!defaultProvider) {
            throw new AuthenticationError('No default auth provider configured');
          }

          const tokenStorageConfig = {
            ...DEFAULT_TOKEN_STORAGE_CONFIG,
            ...config.tokenStorage
          };

          const defaultProviderType = config.providers.find((p) => p.default)?.type ?? 'keycloak';

          return new AuthService(
            (name?: string) => providerFactory.getProvider(name ?? defaultProviderType),
            defaultProviderType,
            {
              enableTokenStorage: tokenStorageConfig.enabled,
              enableTokenRotation: tokenStorageConfig.enableRotation,
              enableBlacklisting: tokenStorageConfig.enableBlacklisting
            }
          );
        },
        inject: [AUTH_PROVIDER_FACTORY]
      }
    ];

    // Add JWT strategy if JWT config is provided
    if (options.jwt) {
      providers.push({
        provide: JwtStrategy,
        useFactory: () => new JwtStrategy(options.jwt ?? { secretOrKey: '' })
      });
    }

    // Export services
    providers.push(
      {
        provide: TOKEN_SERVICE,
        useClass: TokenService
      },
      {
        provide: JWT_SERVICE,
        useClass: JwtService
      }
    );

    return {
      module: AuthModule,
      providers,
      exports: [
        AUTH_PROVIDER_FACTORY,
        AUTH_SERVICE,
        TOKEN_SERVICE,
        JWT_SERVICE,
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
        EnhancedPermissionsGuard
      ]
    };
  }

  /**
   * Configure auth module with async configuration
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     AuthModule.forRootAsync({
   *       imports: [ConfigModule],
   *       inject: [ConfigService],
   *       useFactory: async (config: ConfigService) => ({
   *         providers: [
   *           keycloakAuthConfig({
   *             default: true,
   *           }),
   *         ],
   *         jwt: {
   *           secretOrKey: config.get('JWT_SECRET'),
   *         },
   *       }),
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRootAsync(options: {
    useFactory: (...args: unknown[]) => Promise<AuthModuleOptions> | AuthModuleOptions;
    inject?: unknown[];
    imports?: DynamicModule[];
  }): DynamicModule {
    return {
      module: AuthModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: 'AUTH_CONFIG',
          useFactory: async (...args: unknown[]) => {
            const config = await options.useFactory(...args);
            validateAuthConfig(config as AuthModuleConfig);
            return config;
          },
          inject: (options.inject ?? []) as string[]
        },
        {
          provide: AUTH_PROVIDER_FACTORY,
          useValue: authProviderFactory
        },
        {
          provide: AUTH_SERVICE,
          useFactory: async (
            config: AuthModuleOptions,
            providerFactory: typeof authProviderFactory
          ) => {
            // Initialize providers
            providerFactory.clearProviders();
            // CRITICAL: Must await registration since registerProviderConfigs is async
            await providerFactory.registerProviderConfigs(config.providers);

            const defaultProvider = providerFactory.getDefaultProvider();
            if (!defaultProvider) {
              throw new AuthenticationError('No default auth provider configured');
            }

            const tokenStorageConfig = {
              ...DEFAULT_TOKEN_STORAGE_CONFIG,
              ...config.tokenStorage
            };

            const defaultProviderType = config.providers.find((p) => p.default)?.type ?? 'keycloak';

            return new AuthService(
              (name?: string) => providerFactory.getProvider(name ?? defaultProviderType),
              defaultProviderType,
              {
                enableTokenStorage: tokenStorageConfig.enabled,
                enableTokenRotation: tokenStorageConfig.enableRotation,
                enableBlacklisting: tokenStorageConfig.enableBlacklisting
              }
            );
          },
          inject: ['AUTH_CONFIG', AUTH_PROVIDER_FACTORY]
        },
        // JWT strategy
        {
          provide: JwtStrategy,
          useFactory: (config: AuthModuleOptions) => {
            if (config.jwt) {
              return new JwtStrategy(config.jwt);
            }
            return null;
          },
          inject: ['AUTH_CONFIG']
        },
        // Export services
        {
          provide: TOKEN_SERVICE,
          useClass: TokenService
        },
        {
          provide: JWT_SERVICE,
          useClass: JwtService
        }
      ],
      exports: [AUTH_PROVIDER_FACTORY, AUTH_SERVICE, TOKEN_SERVICE, JWT_SERVICE]
    };
  }
}

/**
 * Re-export types and classes for convenience
 */
export type { AuthModuleConfig, TokenStorageConfig } from './config/auth-config';
export type { IAuthProvider, AuthProviderConfig } from './providers/factory';
export type {
  KeycloakAuthProviderOptions,
  GoogleIdentityPlatformAuthProviderOptions
} from './providers/factory.types';
export { keycloakAuthConfig, googleIdentityPlatformAuthConfig } from './config/auth-config';
export { AuthService } from './services/auth.service';
export { jwtService, JwtService } from './services/jwt.service';
export { tokenService, TokenService } from './services/token.service';
export { JwtStrategy } from './strategies/jwt.strategy';
export { JwtAuthGuard, RolesGuard, PermissionsGuard, EnhancedPermissionsGuard } from './guards';
export { Public } from './decorators/public.decorator';
export { Roles, RequireAdmin, RequireModerator, RequireUser } from './decorators/roles.decorator';
export {
  RequirePermissions,
  RequireAnyPermission,
  CanCreate,
  CanRead,
  CanUpdate,
  CanDelete,
  CanManage
} from './decorators/permissions.decorator';
export {
  User,
  UserId,
  TenantId,
  ActorId,
  Username,
  Email,
  UserRoles,
  UserPermissions
} from './decorators/user.decorator';
export * from './errors';
export * from './types/auth.types';
export * from './types/jwt.types';
export * from './types/user.types';
export * from './constants';
