import { resolveEmailProviderConfig, resolveEmailConfig } from '../config/config-resolver';
import { EmailProviderType } from '../config/interfaces';
import { EmailConfigurationError } from '../errors';

import type { IEmailResolverOptions } from '../config/interfaces';

describe('resolveEmailProviderConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should return mock config when no provider specified', () => {
    const config = resolveEmailProviderConfig();

    expect(config.type).toBe(EmailProviderType.MOCK);
    expect(config.defaultFromEmail).toBeDefined();
    expect(config.defaultFromEmail).toBeTruthy();
  });

  it('should throw EmailConfigurationError for invalid provider type', () => {
    process.env['EMAIL_PROVIDER'] = 'invalid-provider';

    expect(() => {
      resolveEmailProviderConfig();
    }).toThrow(EmailConfigurationError);
  });

  it('should throw EmailConfigurationError when DEFAULT_FROM_EMAIL is missing for non-mock provider', () => {
    process.env['EMAIL_PROVIDER'] = 'resend';
    process.env['RESEND_API_KEY'] = 'test-api-key';
    // intentionally omit DEFAULT_FROM_EMAIL

    expect(() => {
      resolveEmailProviderConfig();
    }).toThrow(EmailConfigurationError);
  });

  it('should resolve Resend config from environment', () => {
    process.env['EMAIL_PROVIDER'] = 'resend';
    process.env['RESEND_API_KEY'] = 'test-api-key';
    process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';

    const config = resolveEmailProviderConfig();

    expect(config.type).toBe(EmailProviderType.RESEND);
    expect(config.defaultFromEmail).toBe('test@example.com');
    if (config.type === EmailProviderType.RESEND) {
      expect(config.apiKey).toBe('test-api-key');
    }
  });

  it('should throw EmailConfigurationError when Resend API key is missing', () => {
    process.env['EMAIL_PROVIDER'] = 'resend';
    process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';

    expect(() => {
      resolveEmailProviderConfig();
    }).toThrow(EmailConfigurationError);
  });

  it('should resolve Twilio config from environment', () => {
    process.env['EMAIL_PROVIDER'] = 'twilio';
    process.env['TWILIO_ACCOUNT_SID'] = 'test-account-sid';
    process.env['TWILIO_AUTH_TOKEN'] = 'test-auth-token';
    process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';

    const config = resolveEmailProviderConfig();

    expect(config.type).toBe(EmailProviderType.TWILIO);
    expect(config.defaultFromEmail).toBe('test@example.com');
    if (config.type === EmailProviderType.TWILIO) {
      expect(config.accountSid).toBe('test-account-sid');
      expect(config.authToken).toBe('test-auth-token');
    }
  });

  it('should throw EmailConfigurationError when Twilio credentials are missing', () => {
    process.env['EMAIL_PROVIDER'] = 'twilio';
    process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';

    expect(() => {
      resolveEmailProviderConfig();
    }).toThrow(EmailConfigurationError);
  });

  it('should resolve SendGrid config from environment', () => {
    process.env['EMAIL_PROVIDER'] = 'sendgrid';
    process.env['SENDGRID_API_KEY'] = 'test-sendgrid-key';
    process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';

    const config = resolveEmailProviderConfig();

    expect(config.type).toBe(EmailProviderType.SENDGRID);
    expect(config.defaultFromEmail).toBe('test@example.com');
    if (config.type === EmailProviderType.SENDGRID) {
      expect(config.apiKey).toBe('test-sendgrid-key');
    }
  });

  it('should throw EmailConfigurationError when SendGrid API key is missing', () => {
    process.env['EMAIL_PROVIDER'] = 'sendgrid';
    process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';

    expect(() => {
      resolveEmailProviderConfig();
    }).toThrow(EmailConfigurationError);
  });

  it('should include optional defaultFromName when provided', () => {
    process.env['EMAIL_PROVIDER'] = 'mock';
    process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';
    process.env['DEFAULT_FROM_NAME'] = 'Test Sender';

    const config = resolveEmailProviderConfig();

    expect(config.defaultFromName).toBe('Test Sender');
  });

  describe('three-tier priority resolution', () => {
    it('should prioritize user config over environment variables', () => {
      process.env['EMAIL_PROVIDER'] = 'mock';
      process.env['DEFAULT_FROM_EMAIL'] = 'env@example.com';
      process.env['DEFAULT_FROM_NAME'] = 'Env Sender';

      const options: IEmailResolverOptions = {
        provider: {
          defaultFromEmail: 'user@example.com',
          defaultFromName: 'User Sender'
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.defaultFromEmail).toBe('user@example.com');
      expect(config.defaultFromName).toBe('User Sender');
    });

    it('should prioritize user config for provider type', () => {
      process.env['EMAIL_PROVIDER'] = 'resend';
      process.env['RESEND_API_KEY'] = 'test-key';
      process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';

      const options: IEmailResolverOptions = {
        provider: {
          type: EmailProviderType.MOCK
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.type).toBe(EmailProviderType.MOCK);
    });

    it('should use environment variables when user config is not provided', () => {
      process.env['EMAIL_PROVIDER'] = 'mock';
      process.env['DEFAULT_FROM_EMAIL'] = 'env@example.com';
      process.env['DEFAULT_FROM_NAME'] = 'Env Sender';

      const config = resolveEmailProviderConfig();

      expect(config.defaultFromEmail).toBe('env@example.com');
      expect(config.defaultFromName).toBe('Env Sender');
    });

    it('should use defaults when neither user config nor env vars are provided', () => {
      // Clear all relevant env vars
      delete process.env['EMAIL_PROVIDER'];
      delete process.env['DEFAULT_FROM_EMAIL'];
      delete process.env['DEFAULT_FROM_NAME'];

      const config = resolveEmailProviderConfig();

      expect(config.type).toBe(EmailProviderType.MOCK);
      expect(config.defaultFromEmail).toBeTruthy(); // Should have default
    });

    it('should resolve debug flag from user config', () => {
      const options: IEmailResolverOptions = {
        provider: {
          debug: true
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.debug).toBe(true);
    });

    it('should resolve debug flag from environment variable', () => {
      process.env['EMAIL_DEBUG'] = 'true';

      const config = resolveEmailProviderConfig();

      expect(config.debug).toBe(true);
    });

    it('should prioritize user config debug over environment', () => {
      process.env['EMAIL_DEBUG'] = 'true';

      const options: IEmailResolverOptions = {
        provider: {
          debug: false
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.debug).toBe(false);
    });
  });

  describe('custom environment variable names', () => {
    it('should use custom env var name for provider type', () => {
      process.env['MY_EMAIL_PROVIDER'] = 'mock';
      process.env['MY_FROM_EMAIL'] = 'custom@example.com';

      const options: IEmailResolverOptions = {
        envVarNames: {
          provider: 'MY_EMAIL_PROVIDER',
          defaultFromEmail: 'MY_FROM_EMAIL'
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.type).toBe(EmailProviderType.MOCK);
      expect(config.defaultFromEmail).toBe('custom@example.com');
    });

    it('should use custom env var name for Resend API key', () => {
      process.env['MY_RESEND_KEY'] = 'custom-api-key';
      process.env['MY_EMAIL_PROVIDER'] = 'resend';
      process.env['MY_FROM_EMAIL'] = 'custom@example.com';

      const options: IEmailResolverOptions = {
        envVarNames: {
          provider: 'MY_EMAIL_PROVIDER',
          defaultFromEmail: 'MY_FROM_EMAIL',
          resendApiKey: 'MY_RESEND_KEY'
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.type).toBe(EmailProviderType.RESEND);
      if (config.type === EmailProviderType.RESEND) {
        expect(config.apiKey).toBe('custom-api-key');
      }
    });

    it('should use custom env var names for Twilio credentials', () => {
      process.env['MY_TWILIO_SID'] = 'custom-sid';
      process.env['MY_TWILIO_TOKEN'] = 'custom-token';
      process.env['MY_EMAIL_PROVIDER'] = 'twilio';
      process.env['MY_FROM_EMAIL'] = 'custom@example.com';

      const options: IEmailResolverOptions = {
        envVarNames: {
          provider: 'MY_EMAIL_PROVIDER',
          defaultFromEmail: 'MY_FROM_EMAIL',
          twilioAccountSid: 'MY_TWILIO_SID',
          twilioAuthToken: 'MY_TWILIO_TOKEN'
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.type).toBe(EmailProviderType.TWILIO);
      if (config.type === EmailProviderType.TWILIO) {
        expect(config.accountSid).toBe('custom-sid');
        expect(config.authToken).toBe('custom-token');
      }
    });

    it('should use custom env var name for SendGrid API key', () => {
      process.env['MY_SENDGRID_KEY'] = 'custom-sendgrid-key';
      process.env['MY_EMAIL_PROVIDER'] = 'sendgrid';
      process.env['MY_FROM_EMAIL'] = 'custom@example.com';

      const options: IEmailResolverOptions = {
        envVarNames: {
          provider: 'MY_EMAIL_PROVIDER',
          defaultFromEmail: 'MY_FROM_EMAIL',
          sendgridApiKey: 'MY_SENDGRID_KEY'
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.type).toBe(EmailProviderType.SENDGRID);
      if (config.type === EmailProviderType.SENDGRID) {
        expect(config.apiKey).toBe('custom-sendgrid-key');
      }
    });

    it('should use custom env var name for debug flag', () => {
      process.env['MY_DEBUG'] = 'true';

      const options: IEmailResolverOptions = {
        envVarNames: {
          debug: 'MY_DEBUG'
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.debug).toBe(true);
    });

    it('should merge custom env var names with defaults', () => {
      // Only override provider env var, use default for others
      process.env['CUSTOM_PROVIDER'] = 'mock';
      process.env['DEFAULT_FROM_EMAIL'] = 'default@example.com';

      const options: IEmailResolverOptions = {
        envVarNames: {
          provider: 'CUSTOM_PROVIDER'
        }
      };

      const config = resolveEmailProviderConfig(options);

      expect(config.type).toBe(EmailProviderType.MOCK);
      expect(config.defaultFromEmail).toBe('default@example.com');
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace-only environment variable values', () => {
      process.env['EMAIL_PROVIDER'] = '   ';

      expect(() => {
        resolveEmailProviderConfig();
      }).toThrow(EmailConfigurationError);
    });

    it('should handle case-insensitive provider type', () => {
      process.env['EMAIL_PROVIDER'] = 'MOCK';

      // Should throw because 'MOCK' !== 'mock' (enum values are lowercase)
      expect(() => {
        resolveEmailProviderConfig();
      }).toThrow(EmailConfigurationError);
    });

    it('should handle empty string env var as unset', () => {
      process.env['EMAIL_PROVIDER'] = '';
      process.env['DEFAULT_FROM_EMAIL'] = '';

      // Should use defaults when empty
      const config = resolveEmailProviderConfig();

      expect(config.type).toBe(EmailProviderType.MOCK);
    });

    it('should include Twilio email service SID when provided', () => {
      process.env['EMAIL_PROVIDER'] = 'twilio';
      process.env['TWILIO_ACCOUNT_SID'] = 'test-account-sid';
      process.env['TWILIO_AUTH_TOKEN'] = 'test-auth-token';
      process.env['TWILIO_EMAIL_SERVICE_SID'] = 'test-service-sid';
      process.env['DEFAULT_FROM_EMAIL'] = 'test@example.com';

      const config = resolveEmailProviderConfig();

      if (config.type === EmailProviderType.TWILIO) {
        expect(config.emailServiceSid).toBe('test-service-sid');
      }
    });

    it('should sanitize provider type in error messages (log injection prevention)', () => {
      process.env['EMAIL_PROVIDER'] = 'invalid\r\n\twith-control-chars';

      try {
        resolveEmailProviderConfig();
        // If we get here, test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(EmailConfigurationError);
        // Verify control characters are sanitized
        expect((error as EmailConfigurationError).message).not.toContain('\r');
        expect((error as EmailConfigurationError).message).not.toContain('\n');
        expect((error as EmailConfigurationError).message).not.toContain('\t');
      }
    });
  });
});

describe('resolveEmailConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return full email module configuration', () => {
    const config = resolveEmailConfig();

    expect(config.provider).toBeDefined();
    expect(typeof config.enableGracefulShutdown).toBe('boolean');
    expect(typeof config.enableTracing).toBe('boolean');
  });

  describe('three-tier priority resolution', () => {
    it('should prioritize user config for module options', () => {
      const options: IEmailResolverOptions = {
        enableGracefulShutdown: false,
        enableTracing: false
      };

      const config = resolveEmailConfig(options);

      expect(config.enableGracefulShutdown).toBe(false);
      expect(config.enableTracing).toBe(false);
    });

    it('should resolve enableGracefulShutdown from environment', () => {
      process.env['EMAIL_GRACEFUL_SHUTDOWN'] = 'false';

      const options: IEmailResolverOptions = {
        envVarNames: {
          enableGracefulShutdown: 'EMAIL_GRACEFUL_SHUTDOWN'
        }
      };

      const config = resolveEmailConfig(options);

      expect(config.enableGracefulShutdown).toBe(false);
    });

    it('should resolve enableTracing from environment', () => {
      process.env['EMAIL_TRACING'] = 'false';

      const options: IEmailResolverOptions = {
        envVarNames: {
          enableTracing: 'EMAIL_TRACING'
        }
      };

      const config = resolveEmailConfig(options);

      expect(config.enableTracing).toBe(false);
    });

    it('should pass options through to provider config resolution', () => {
      const options: IEmailResolverOptions = {
        provider: {
          defaultFromEmail: 'user@example.com'
        }
      };

      const config = resolveEmailConfig(options);

      expect(config.provider.defaultFromEmail).toBe('user@example.com');
    });
  });
});
