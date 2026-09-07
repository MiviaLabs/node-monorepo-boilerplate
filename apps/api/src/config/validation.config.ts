/* eslint-disable complexity */
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, IsOptional, validateSync } from 'class-validator';

/**
 * Environment variable validation schema.
 * Ensures all required environment variables are present and valid at startup.
 *
 * Usage:
 * import { validateConfig } from './config/validation.config';
 *
 * async function bootstrap() {
 *   // Validate environment variables before starting app
 *   validateConfig();
 *
 *   const app = await NestFactory.create(AppModule);
 *   // ...
 * }
 *
 * Environment variables:
 * Required:
 * - NODE_ENV: 'development' | 'production' | 'test'
 * - HOST: Server host (default: '0.0.0.0')
 * - PORT: Server port (default: 3000)
 * - API_PREFIX: API URL prefix (default: 'api')
 * - CORS_ENABLED: Enable CORS (default: false)
 * - CORS_ORIGIN: CORS origin (default: '*')
 * - DATABASE_URL: PostgreSQL connection string
 * - REDIS_URL: Redis connection string
 *
 * Optional:
 * - JWT_SECRET: JWT signing secret
 * - JWT_EXPIRATION: Token expiration time
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OpenTelemetry endpoint
 * - SECURITY_HEADERS_ENABLED: Enable security headers (default: true)
 * - RATE_LIMIT_DEFAULT_LIMIT: Default rate limit (default: 100)
 * - RATE_LIMIT_DEFAULT_TTL: Default rate limit TTL in seconds (default: 60)
 */
class EnvironmentVariables {
  // Application
  @IsString()
  @IsOptional()
  NODE_ENV?: string;

  @IsString()
  @IsOptional()
  HOST?: string;

  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsOptional()
  API_PREFIX?: string;

  // CORS
  @IsBoolean()
  @IsOptional()
  CORS_ENABLED?: boolean;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  // Database
  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  // Security
  @IsString()
  @IsOptional()
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRATION?: string;

  // Observability
  @IsString()
  @IsOptional()
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  @IsBoolean()
  @IsOptional()
  OTEL_ENABLED?: boolean;

  // Security Headers
  @IsBoolean()
  @IsOptional()
  SECURITY_HEADERS_ENABLED?: boolean;

  @IsBoolean()
  @IsOptional()
  SECURITY_HSTS_ENABLED?: boolean;

  @IsNumber()
  @IsOptional()
  SECURITY_HSTS_MAX_AGE?: number;

  @IsBoolean()
  @IsOptional()
  SECURITY_HSTS_INCLUDE_SUBDOMAINS?: boolean;

  @IsBoolean()
  @IsOptional()
  SECURITY_HSTS_PRELOAD?: boolean;

  @IsBoolean()
  @IsOptional()
  SECURITY_CSP_ENABLED?: boolean;

  // Rate Limiting
  @IsNumber()
  @IsOptional()
  RATE_LIMIT_DEFAULT_LIMIT?: number;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_DEFAULT_TTL?: number;
}

/**
 * Validate environment variables.
 * Throws if any required variables are missing or invalid.
 *
 * @returns Validated environment variables
 * @throws Error with details of validation failures
 */
export function validateConfig(): EnvironmentVariables {
  const getEnv = (key: keyof EnvironmentVariables): string | undefined => process.env[key];

  const envToValidate: Partial<Record<keyof EnvironmentVariables, string | undefined>> = {
    NODE_ENV: getEnv('NODE_ENV'),
    HOST: getEnv('HOST'),
    PORT: getEnv('PORT'),
    API_PREFIX: getEnv('API_PREFIX'),
    CORS_ENABLED: getEnv('CORS_ENABLED'),
    CORS_ORIGIN: getEnv('CORS_ORIGIN'),
    DATABASE_URL: getEnv('DATABASE_URL'),
    REDIS_URL: getEnv('REDIS_URL'),
    JWT_SECRET: getEnv('JWT_SECRET'),
    JWT_EXPIRATION: getEnv('JWT_EXPIRATION'),
    OTEL_EXPORTER_OTLP_ENDPOINT: getEnv('OTEL_EXPORTER_OTLP_ENDPOINT'),
    OTEL_ENABLED: getEnv('OTEL_ENABLED'),
    SECURITY_HEADERS_ENABLED: getEnv('SECURITY_HEADERS_ENABLED'),
    SECURITY_HSTS_ENABLED: getEnv('SECURITY_HSTS_ENABLED'),
    SECURITY_HSTS_MAX_AGE: getEnv('SECURITY_HSTS_MAX_AGE'),
    SECURITY_HSTS_INCLUDE_SUBDOMAINS: getEnv('SECURITY_HSTS_INCLUDE_SUBDOMAINS'),
    SECURITY_HSTS_PRELOAD: getEnv('SECURITY_HSTS_PRELOAD'),
    SECURITY_CSP_ENABLED: getEnv('SECURITY_CSP_ENABLED'),
    RATE_LIMIT_DEFAULT_LIMIT: getEnv('RATE_LIMIT_DEFAULT_LIMIT'),
    RATE_LIMIT_DEFAULT_TTL: getEnv('RATE_LIMIT_DEFAULT_TTL')
  };

  // Convert environment variables to class instance
  const validatedConfig = plainToInstance(EnvironmentVariables, envToValidate, {
    enableImplicitConversion: true
  });

  // Validate the instance
  const errors = validateSync(validatedConfig, {
    whitelist: true,
    forbidNonWhitelisted: true
  });

  if (errors.length > 0) {
    const errorMessages = errors.map((error) => {
      const constraints = Object.values(error.constraints ?? {}).join(', ');
      return `${error.property}: ${constraints}`;
    });

    throw new Error(`Environment variable validation failed:\n${errorMessages.join('\n')}`);
  }

  return validatedConfig;
}

/**
 * Configuration provider that validates environment variables.
 * Use this in your AppModule to ensure valid configuration at startup.
 */
export default registerAs('validation', () => {
  // Validate on module load
  const validated = validateConfig();

  return {
    // Expose validated environment variables
    nodeEnv: validated.NODE_ENV ?? 'development',
    host: validated.HOST ?? '0.0.0.0',
    port: validated.PORT ?? 3000,
    apiPrefix: validated.API_PREFIX ?? 'api',
    corsEnabled: validated.CORS_ENABLED ?? false,
    corsOrigin: validated.CORS_ORIGIN ?? '*',
    databaseUrl: validated.DATABASE_URL,
    redisUrl: validated.REDIS_URL,
    jwtSecret: validated.JWT_SECRET,
    jwtExpiration: validated.JWT_EXPIRATION ?? '1h',
    otelExporterEndpoint: validated.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelEnabled: validated.OTEL_ENABLED ?? false,
    securityHeadersEnabled: validated.SECURITY_HEADERS_ENABLED ?? true,
    securityHstsEnabled: validated.SECURITY_HSTS_ENABLED ?? true,
    securityHstsMaxAge: validated.SECURITY_HSTS_MAX_AGE ?? 31536000,
    securityHstsIncludeSubdomains: validated.SECURITY_HSTS_INCLUDE_SUBDOMAINS ?? true,
    securityHstsPreload: validated.SECURITY_HSTS_PRELOAD ?? false,
    securityCspEnabled: validated.SECURITY_CSP_ENABLED ?? true,
    rateLimitDefaultLimit: validated.RATE_LIMIT_DEFAULT_LIMIT ?? 100,
    rateLimitDefaultTtl: validated.RATE_LIMIT_DEFAULT_TTL ?? 60
  };
});
