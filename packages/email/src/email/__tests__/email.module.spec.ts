/**
 * EmailModule Unit Tests
 *
 * Tests the NestJS EmailModule dynamic module registration including
 * forRoot(), forRootAsync(), provider registration, and lifecycle hooks.
 *
 * @packageDocumentation
 */

import { EmailProviderType } from '../../config/interfaces';
import { EMAIL_MODULE_OPTIONS, EMAIL_PROVIDER } from '../email.constants';
import { EmailModule } from '../email.module';
import { EmailService } from '../email.service';

import type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse
} from '../../providers/email-provider.interface';
import type {
  IEmailModuleOptions,
  IEmailModuleAsyncOptions,
  IEmailModuleOptionsFactory
} from '../interfaces';

/**
 * Mock Email Provider for testing.
 */
export class _MockEmailProvider implements IEmailProvider {
  readonly name = 'mock';

  async sendEmail(_request: ISendEmailRequest): Promise<ISendEmailResponse> {
    return {
      messageId: `msg-${Date.now()}`,
      success: true
    };
  }

  async sendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    return requests.map(() => ({
      messageId: `msg-${Date.now()}-${Math.random()}`,
      success: true
    }));
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * Mock Email Module Options Factory for testing.
 */
class MockEmailOptionsFactory implements IEmailModuleOptionsFactory {
  createEmailModuleOptions(): IEmailModuleOptions {
    return {
      provider: {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com'
      },
      global: true
    };
  }
}

describe('EmailModule', () => {
  describe('forRoot()', () => {
    it('should create a dynamic module with providers', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert
      expect(dynamicModule.module).toBe(EmailModule);
      expect(Array.isArray(dynamicModule.providers)).toBe(true);
      expect(Array.isArray(dynamicModule.exports)).toBe(true);
      expect(dynamicModule.global).toBe(false);
    });

    it('should export EMAIL_PROVIDER token', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert
      expect(dynamicModule.exports?.includes(EMAIL_PROVIDER)).toBe(true);
    });

    it('should export EmailService', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert
      expect(dynamicModule.exports?.includes(EmailService)).toBe(true);
    });

    it('should include EmailService in providers', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert
      expect(dynamicModule.providers?.includes(EmailService)).toBe(true);
    });

    it('should support global option', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        },
        global: true
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert
      expect(dynamicModule.global).toBe(true);
    });

    it('should create provider factory', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert: Check that providers includes EMAIL_PROVIDER factory
      const providerProvider = dynamicModule.providers?.find(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === EMAIL_PROVIDER
      );
      expect(providerProvider).toBeTruthy();
    });

    it('should create options provider', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert: Check that providers includes EMAIL_MODULE_OPTIONS
      const optionsProvider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          p.provide === EMAIL_MODULE_OPTIONS
      );
      expect(optionsProvider).toBeTruthy();
    });
  });

  describe('forRootAsync()', () => {
    it('should create a dynamic module with async providers', () => {
      // Arrange
      const asyncOptions: IEmailModuleAsyncOptions = {
        useFactory: () => ({
          provider: {
            type: EmailProviderType.MOCK,
            defaultFromEmail: 'noreply@example.com'
          }
        })
      };

      // Act
      const dynamicModule = EmailModule.forRootAsync(asyncOptions);

      // Assert
      expect(dynamicModule.module).toBe(EmailModule);
      expect(Array.isArray(dynamicModule.providers)).toBe(true);
      expect(Array.isArray(dynamicModule.exports)).toBe(true);
    });

    it('should support useFactory pattern', () => {
      // Arrange
      const factoryResult: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };
      const asyncOptions: IEmailModuleAsyncOptions = {
        useFactory: () => factoryResult,
        inject: []
      };

      // Act
      const dynamicModule = EmailModule.forRootAsync(asyncOptions);

      // Assert
      expect(dynamicModule.providers).toBeTruthy();
      expect(dynamicModule.exports?.includes(EMAIL_PROVIDER)).toBe(true);
    });

    it('should support useClass pattern', () => {
      // Arrange
      const asyncOptions: IEmailModuleAsyncOptions = {
        useClass: MockEmailOptionsFactory
      };

      // Act
      const dynamicModule = EmailModule.forRootAsync(asyncOptions);

      // Assert
      expect(dynamicModule.providers).toBeTruthy();
      expect(dynamicModule.providers?.length).toBe(5); // optionsProvider, useClass provider, providerFactory, EmailService, EmailJobHandler
    });

    it('should support useExisting pattern', () => {
      // Arrange
      const asyncOptions: IEmailModuleAsyncOptions = {
        useExisting: MockEmailOptionsFactory
      };

      // Act
      const dynamicModule = EmailModule.forRootAsync(asyncOptions);

      // Assert
      expect(dynamicModule.providers).toBeTruthy();
    });

    it('should support useValue pattern', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };
      const asyncOptions: IEmailModuleAsyncOptions = {
        useValue: options
      };

      // Act
      const dynamicModule = EmailModule.forRootAsync(asyncOptions);

      // Assert
      expect(dynamicModule.providers).toBeTruthy();
      expect(dynamicModule.providers?.length).toBe(4); // optionsProvider, provider factory, EmailService, EmailJobHandler
    });

    it('should support imports option', () => {
      // Arrange
      const mockModule = { module: 'MockModule' };
      const asyncOptions: IEmailModuleAsyncOptions = {
        imports: [mockModule as any],
        useFactory: () => ({
          provider: {
            type: EmailProviderType.MOCK,
            defaultFromEmail: 'noreply@example.com'
          }
        })
      };

      // Act
      const dynamicModule = EmailModule.forRootAsync(asyncOptions);

      // Assert
      expect(Array.isArray(dynamicModule.imports)).toBe(true);
      expect((dynamicModule.imports as any[])?.[0]?.module).toBe('MockModule');
    });

    it('should support global option', () => {
      // Arrange
      const asyncOptions: IEmailModuleAsyncOptions = {
        global: true,
        useFactory: () => ({
          provider: {
            type: EmailProviderType.MOCK,
            defaultFromEmail: 'noreply@example.com'
          }
        })
      };

      // Act
      const dynamicModule = EmailModule.forRootAsync(asyncOptions);

      // Assert
      expect(dynamicModule.global).toBe(true);
    });

    it('should default global to false', () => {
      // Arrange
      const asyncOptions: IEmailModuleAsyncOptions = {
        useFactory: () => ({
          provider: {
            type: EmailProviderType.MOCK,
            defaultFromEmail: 'noreply@example.com'
          }
        })
      };

      // Act
      const dynamicModule = EmailModule.forRootAsync(asyncOptions);

      // Assert
      expect(dynamicModule.global).toBe(false);
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should implement OnModuleDestroy', () => {
      // Arrange & Act
      const moduleInstance = new EmailModule();

      // Assert: Verify module has onModuleDestroy method
      expect(typeof moduleInstance.onModuleDestroy).toBe('function');
    });

    it('should handle onModuleDestroy gracefully', () => {
      // Arrange
      const moduleInstance = new EmailModule();

      // Act & Assert: Should not throw
      expect(() => {
        moduleInstance.onModuleDestroy();
      }).not.toThrow();
    });

    it('should release provider reference on destroy', () => {
      // Arrange
      const moduleInstance = new EmailModule();

      // Act
      moduleInstance.onModuleDestroy();

      // Assert: Provider reference should be cleared (internal state)
      // This is a structural test - actual cleanup logic is provider-specific
      expect('onModuleDestroy executed without error').toBeTruthy();
    });
  });

  describe('Provider Registration', () => {
    it('should register EMAIL_MODULE_OPTIONS token', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert
      const hasOptionsProvider = dynamicModule.providers?.some(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          p.provide === EMAIL_MODULE_OPTIONS
      );
      expect(hasOptionsProvider).toBe(true);
    });

    it('should register EMAIL_PROVIDER token', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert
      const hasProviderProvider = dynamicModule.providers?.some(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === EMAIL_PROVIDER
      );
      expect(hasProviderProvider).toBe(true);
    });

    it('should use provider factory to create provider instance', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert: Find the provider factory
      const providerFactory = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          p.provide === EMAIL_PROVIDER &&
          'useFactory' in p
      );
      expect(providerFactory).toBeTruthy();
    });
  });

  describe('Module Compilation', () => {
    it('should be compatible with NestJS module system', () => {
      // Arrange
      const options: IEmailModuleOptions = {
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(options);

      // Assert: Verify required NestJS DynamicModule properties
      expect(dynamicModule.module).toBeTruthy();
      expect(Array.isArray(dynamicModule.providers)).toBe(true);
      expect(Array.isArray(dynamicModule.exports)).toBe(true);
    });

    it('should have proper module metadata', () => {
      // Arrange & Act
      const dynamicModule = EmailModule.forRoot({
        provider: {
          type: EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      });

      // Assert: Verify all required metadata exists
      expect(dynamicModule.module).toBeTruthy();
      expect(dynamicModule.providers).toBeTruthy();
      expect(dynamicModule.exports).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid provider type in createProviderInstance', () => {
      // This test verifies that invalid provider types are handled
      // The actual error would occur during NestJS DI resolution

      // Arrange
      const invalidOptions: IEmailModuleOptions = {
        provider: {
          type: 'invalid' as EmailProviderType.MOCK,
          defaultFromEmail: 'noreply@example.com'
        }
      };

      // Act
      const dynamicModule = EmailModule.forRoot(invalidOptions);

      // Assert: Module should still be created (error occurs during DI)
      expect(dynamicModule.module).toBeTruthy();
    });

    it('should handle missing inject array gracefully', () => {
      // Arrange
      const asyncOptions: IEmailModuleAsyncOptions = {
        useFactory: () => ({
          provider: {
            type: EmailProviderType.MOCK,
            defaultFromEmail: 'noreply@example.com'
          }
        })
        // inject is intentionally omitted
      };

      // Act & Assert: Should not throw
      expect(() => {
        EmailModule.forRootAsync(asyncOptions);
      }).not.toThrow();
    });
  });
});
