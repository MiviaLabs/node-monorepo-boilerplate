/**
 * Auth Provider Factory
 *
 * Creates auth provider instances based on configuration
 */

import { Injectable, Scope } from '@nestjs/common';

import { AuthProviderType } from '../constants';
import { InvalidAuthProviderConfigError } from '../errors';

import type { IAuthProvider } from './auth-provider.interface';
import type {
  KeycloakAuthProviderOptions,
  GoogleAuthProviderOptions,
  GoogleIdentityPlatformAuthProviderOptions,
  CustomJwtAuthProviderOptions
} from './factory.types';

// Re-export types for external use
export type {
  KeycloakAuthProviderOptions,
  GoogleAuthProviderOptions,
  GoogleIdentityPlatformAuthProviderOptions,
  CustomJwtAuthProviderOptions
} from './factory.types';

// Re-export IAuthProvider for convenience
export type { IAuthProvider } from './auth-provider.interface';

/**
 * Provider configuration interface
 */
export interface AuthProviderConfig {
  /** Provider type (keycloak, aws-cognito, google, azure-ad) */
  type: AuthProviderType;
  /** Whether this is the default provider */
  default?: boolean;
  /** Provider-specific options */
  options: import('./factory.types').AuthProviderOptions;
}

/**
 * Auth Provider Factory interface for dependency injection
 */
export interface IAuthProviderFactory {
  registerProvider(name: string, provider: IAuthProvider, isDefault?: boolean): void;
  getProvider(name: string): IAuthProvider | undefined;
  getDefaultProvider(): IAuthProvider | undefined;
  getProviderNames(): string[];
  createProvider(config: AuthProviderConfig): Promise<IAuthProvider>;
  registerProviderConfig(config: AuthProviderConfig): Promise<IAuthProvider>;
  registerProviderConfigs(configs: AuthProviderConfig[]): Promise<void>;
  clearProviders(): void;
  healthCheckAll(): Promise<Record<string, boolean>>;
}

/**
 * Auth Provider Factory
 *
 * Dynamically creates auth provider instances based on configuration.
 * Supports lazy loading of provider dependencies.
 * Injectable service for NestJS DI.
 */
@Injectable({ scope: Scope.DEFAULT })
export class AuthProviderFactory implements IAuthProviderFactory {
  private providers = new Map<string, IAuthProvider>();
  private defaultProviderName: string | null = null;

  /**
   * Register a provider
   */
  registerProvider(name: string, provider: IAuthProvider, isDefault = false): void {
    // Don't overwrite existing providers
    if (!this.providers.has(name)) {
      this.providers.set(name, provider);
    }
    if (isDefault) {
      this.defaultProviderName = name;
    }
  }

  /**
   * Get a provider by name
   */
  getProvider(name: string): IAuthProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): IAuthProvider | undefined {
    if (this.defaultProviderName) {
      return this.providers.get(this.defaultProviderName);
    }
    // Return first registered provider if no explicit default
    const firstKey = this.providers.keys().next().value;
    return firstKey ? this.providers.get(firstKey) : undefined;
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create a provider from configuration
   */
  async createProvider(config: AuthProviderConfig): Promise<IAuthProvider> {
    const { type, options } = config;

    switch (type) {
      case AuthProviderType.KEYCLOAK: {
        // Lazy load Keycloak provider
        const { KeycloakAuthProvider } = await import('./keycloak.provider');
        return new KeycloakAuthProvider(options as KeycloakAuthProviderOptions);
      }
      case AuthProviderType.GOOGLE: {
        // Lazy load Google provider
        const { GoogleAuthProvider } = await import('./google.provider');
        return new GoogleAuthProvider(options as GoogleAuthProviderOptions);
      }
      case AuthProviderType.GOOGLE_IDENTITY_PLATFORM: {
        // Lazy load Google Identity Platform provider
        const { GoogleIdentityPlatformAuthProvider } =
          await import('./google-identity-platform.provider');
        return new GoogleIdentityPlatformAuthProvider(
          options as GoogleIdentityPlatformAuthProviderOptions
        );
      }
      case AuthProviderType.CUSTOM_JWT: {
        // Lazy load Custom JWT provider
        const { CustomJwtAuthProvider } = await import('./custom-jwt.provider');
        return new CustomJwtAuthProvider(options as CustomJwtAuthProviderOptions);
      }
      // Future providers:
      // case AuthProviderType.AWS_COGNITO: {
      //   const { AwsCognitoAuthProvider } = await import('./aws-cognito.provider');
      //   return new AwsCognitoAuthProvider(options);
      // }
      // case AuthProviderType.AZURE_AD: {
      //   const { AzureAdAuthProvider } = await import('./azure-ad.provider');
      //   return new AzureAdAuthProvider(options);
      // }
      default:
        throw new InvalidAuthProviderConfigError(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Create and register a provider from configuration
   */
  async registerProviderConfig(config: AuthProviderConfig): Promise<IAuthProvider> {
    const provider = await this.createProvider(config);
    this.registerProvider(config.type, provider, config.default);
    return provider;
  }

  /**
   * Create and register multiple providers from configurations
   */
  async registerProviderConfigs(configs: AuthProviderConfig[]): Promise<void> {
    await Promise.all(configs.map((config) => this.registerProviderConfig(config)));
  }

  /**
   * Clear all registered providers
   */
  clearProviders(): void {
    this.providers.clear();
    this.defaultProviderName = null;
  }

  /**
   * Health check for all registered providers
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.healthCheck();
      } catch {
        results[name] = false;
      }
    }

    return results;
  }
}

/**
 * @deprecated Use dependency injection instead. Global singleton will be removed in future versions.
 * For backward compatibility only - prefer injecting IAuthProviderFactory via constructor.
 */
export const authProviderFactory = new AuthProviderFactory();

/**
 * @deprecated Use dependency injection instead. Helper function will be removed in future versions.
 * For backward compatibility only - prefer injecting IAuthProviderFactory via constructor.
 *
 * @param config - Auth provider configuration
 * @returns Promise resolving to the created auth provider
 */
export async function createAuthProvider(config: AuthProviderConfig): Promise<IAuthProvider> {
  return authProviderFactory.createProvider(config);
}

/**
 * @deprecated Use dependency injection instead. Helper function will be removed in future versions.
 * For backward compatibility only - prefer injecting IAuthProviderFactory via constructor.
 *
 * @param name - Provider name to retrieve
 * @returns The auth provider or undefined if not found
 */
export function getAuthProvider(name: string): IAuthProvider | undefined {
  return authProviderFactory.getProvider(name);
}

/**
 * @deprecated Use dependency injection instead. Helper function will be removed in future versions.
 * For backward compatibility only - prefer injecting IAuthProviderFactory via constructor.
 *
 * @returns The default auth provider or undefined if none registered
 */
export function getDefaultAuthProvider(): IAuthProvider | undefined {
  return authProviderFactory.getDefaultProvider();
}
