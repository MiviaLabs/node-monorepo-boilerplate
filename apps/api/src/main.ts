import 'reflect-metadata';
import * as https from 'https';
import { createRequire } from 'module';
import { join } from 'path';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { setupRedoc } from './common/swagger/redoc.setup';
import { setupSwagger } from './common/swagger/swagger.setup';
import { validateConfig } from './config/validation.config';
import { ApiVersionStatus } from './config/version.config';

import type { AppConfig } from './config/app.config';
import type { SwaggerConfig } from './config/swagger.config';
import type { ApiVersionConfig } from './config/version.config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';

type BundlerPathsOverrides = Record<string, string>;
type BundlerGlobal = typeof globalThis & { __bundlerPathsOverrides?: BundlerPathsOverrides };
const bundlerGlobal = globalThis as BundlerGlobal;
const nodeRequire = createRequire(__filename);

function resolveWorkerPath(modulePath: string, fallbackPath: string): string {
  try {
    return nodeRequire.resolve(modulePath);
  } catch {
    return fallbackPath;
  }
}

function resolveFromModule(moduleId: string, modulePath: string, fallbackPath: string): string {
  try {
    const moduleEntry = nodeRequire.resolve(moduleId);
    const moduleRequire = createRequire(moduleEntry);
    return moduleRequire.resolve(modulePath);
  } catch {
    return fallbackPath;
  }
}

// Ensure bundled pino/thread-stream workers resolve to real runtime files.
const existingBundlerOverrides =
  '__bundlerPathsOverrides' in bundlerGlobal
    ? (bundlerGlobal.__bundlerPathsOverrides as BundlerPathsOverrides)
    : {};
bundlerGlobal.__bundlerPathsOverrides = {
  ...existingBundlerOverrides,
  'thread-stream-worker': resolveFromModule(
    'pino/package.json',
    'thread-stream/lib/worker.js',
    join(process.cwd(), 'node_modules', 'thread-stream', 'lib', 'worker.js')
  ),
  'pino-worker': resolveWorkerPath(
    'pino/lib/worker.js',
    join(process.cwd(), 'node_modules', 'pino', 'lib', 'worker.js')
  )
};

/**
 * Proxy Swagger UI assets from CDN to avoid webpack bundling issues.
 * This middleware fetches assets from CDN and serves them locally.
 */
async function proxyFromCdn(cdnUrl: string, res: Response): Promise<void> {
  try {
    const response = await new Promise<IncomingMessage>((resolve) => {
      https
        .get(cdnUrl, (response) => {
          resolve(response);
        })
        .on('error', () => {
          // If CDN fails, return empty response
          resolve(null as unknown as IncomingMessage);
        });
    });

    if (response) {
      const contentType = cdnUrl.endsWith('.css') ? 'text/css' : 'application/javascript';
      res.setHeader('Content-Type', contentType);
      response.pipe(res);
    } else {
      // Fallback to empty response
      res.status(200).send('');
    }
  } catch {
    res.status(200).send('');
  }
}

function swaggerAssetsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || '';
  const cdnBase = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5';

  // Check if this is a request for Swagger UI assets
  if (path.includes('/swagger-ui.css')) {
    void proxyFromCdn(`${cdnBase}/swagger-ui.css`, res);
    return;
  }

  if (path.includes('/swagger-ui-bundle.js')) {
    void proxyFromCdn(`${cdnBase}/swagger-ui-bundle.js`, res);
    return;
  }

  if (path.includes('/swagger-ui-standalone-preset.js')) {
    void proxyFromCdn(`${cdnBase}/swagger-ui-standalone-preset.js`, res);
    return;
  }

  // Handle favicon requests to avoid 404 errors
  if (path.match(/favicon-\d+x\d+\.png$/)) {
    res.status(200).send('');
    return;
  }

  if (path.includes('/swagger-ui-init.js')) {
    // swagger-ui-init.js doesn't exist on CDN
    // Provide the initialization script that Swagger UI expects
    // The URL needs to point to the correct docs-json endpoint
    const initScript = `
window.onload = function() {
  // Determine the correct spec URL based on current path
  // For /api/docs/v1 -> /api/docs/v1-json
  // For /api/docs -> /api/docs-json
  const currentPath = window.location.pathname;

  // Check if this is a versioned path like /api/docs/v1
  const versionMatch = currentPath.match(/\\/docs\\/v\\d+$/);

  let specUrl;
  if (versionMatch) {
    // For versioned paths, just append -json: /api/docs/v1 -> /api/docs/v1-json
    specUrl = currentPath + '-json';
  } else {
    // For non-versioned paths: /api/docs -> /api/docs-json
    specUrl = currentPath.replace(/\\/docs$/, '/docs-json');
  }

  const ui = SwaggerUIBundle({
    url: specUrl,
    dom_id: '#swagger-ui',
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIBundle.SwaggerUIStandalonePreset
    ],
    layout: 'BaseLayout',
    persistAuthorization: true,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
    docExpansion: 'none',
    filter: true,
    showRequestHeaders: true,
    validatorUrl: null
  });
};
`;
    res.setHeader('Content-Type', 'application/javascript');
    res.status(200).send(initScript);
    return;
  }

  next();
}

/**
 * Normalize repeated slashes in request paths while preserving query strings.
 *
 * Example:
 * - //api/v1/health -> /api/v1/health
 * - //api//v1//auth/login?next=//dashboard -> /api/v1/auth/login?next=//dashboard
 */
function normalizeRequestUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  const path = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
  const query = queryIndex >= 0 ? url.slice(queryIndex) : '';
  const normalizedPath = path.replace(/\/{2,}/g, '/');
  return `${normalizedPath}${query}`;
}

function logServerStartupInfo(
  apiPrefix: string,
  host: string,
  port: number,
  swaggerConfig: SwaggerConfig | undefined,
  versionConfig: ApiVersionConfig | undefined
): void {
  // Log base URL
  Logger.log(`🚀 Application is running on: http://${host}:${port}/${apiPrefix}`);

  // Log all available API versions
  if (versionConfig?.versions) {
    Logger.log('📋 Available API Versions:');
    for (const v of versionConfig.versions) {
      const status =
        v.status === ApiVersionStatus.ACTIVE
          ? '✅'
          : v.status === ApiVersionStatus.DEPRECATED
            ? '⚠️'
            : '🔴';
      const versionUrl = `http://${host}:${port}/${apiPrefix}/${v.prefix}`;
      Logger.log(`${status} ${v.prefix}: ${versionUrl}`);

      if (v.status === ApiVersionStatus.DEPRECATED && v.sunsetDate) {
        Logger.log(`   └─ Sunset: ${v.sunsetDate}`);
      }
    }
  }

  // Log health check URL (for default version)
  const defaultVersion = versionConfig?.defaultVersion ?? 'v1';
  Logger.log(`❤️ Health check: http://${host}:${port}/${apiPrefix}/${defaultVersion}/ops/health`);

  // Log Swagger URLs
  if (swaggerConfig?.enabled) {
    const docsPrefix = apiPrefix ? `${apiPrefix}/docs` : 'docs';
    Logger.log(`📚 Swagger Documentation:`);
    Logger.log(`   └─ Index: http://${host}:${port}/${docsPrefix}`);
    if (versionConfig?.versions) {
      for (const v of versionConfig.versions) {
        Logger.log(`   └─ ${v.prefix}: http://${host}:${port}/${docsPrefix}/${v.prefix}`);
      }
    }
    // Log Redoc URL
    // @ts-expect-error - redocEnabled is a custom config option
    if (swaggerConfig?.redocEnabled !== false) {
      Logger.log(`   └─ Redoc: http://${host}:${port}/${docsPrefix}/redoc`);
    }
  }
}

async function bootstrap(): Promise<void> {
  // Validate environment variables before starting app
  validateConfig();

  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true
  });
  const configService = app.get(ConfigService);

  // Normalize repeated slashes before route matching (e.g., //api/v1/health).
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.url = normalizeRequestUrl(req.url);
    next();
  });

  // Apply security headers middleware FIRST (before Swagger assets)
  const securityHeadersEnabled = configService.get<boolean>('securityHeaders.enabled', true);
  if (securityHeadersEnabled) {
    const securityHeadersMiddleware = new SecurityHeadersMiddleware(configService);
    app.use((req: Request, res: Response, next: NextFunction) =>
      securityHeadersMiddleware.use(req, res, next)
    );
  }

  // Apply Swagger assets middleware at Express level BEFORE Swagger setup
  // This intercepts requests for missing swagger-ui-*.js and *.css files
  // and returns empty 200 responses to prevent 404 errors
  app.use(swaggerAssetsMiddleware);

  // Get configuration
  const appConfig = configService.getOrThrow<AppConfig>('app');
  const swaggerConfig = configService.get<SwaggerConfig>('swagger');
  const versionConfig = configService.get<ApiVersionConfig>('version');

  // NOTE: NestJS built-in versioning is DISABLED
  // Versioning is handled manually via @VersionedController decorator
  // which adds the version prefix (v1, v2, etc.) directly to controller paths
  // This allows full control over version routing without NestJS's automatic 'v' prefix

  // Set base API prefix (without version - version is in controller paths)
  // In multi-version mode, controllers include version in their @Controller path
  // e.g., @Controller('v1/users') routes to /api/v1/users
  const apiPrefix = appConfig.apiPrefix || '';
  app.setGlobalPrefix(apiPrefix);

  //CORS
  if (appConfig.corsEnabled) {
    // Parse CORS_ORIGIN: support comma-separated multiple origins
    let corsOrigin: string | string[] | boolean = appConfig.corsOrigin;

    // Handle comma-separated origins
    if (corsOrigin !== '*' && typeof corsOrigin === 'string' && corsOrigin.includes(',')) {
      corsOrigin = corsOrigin.split(',').map((origin) => origin.trim());
    }

    // SEC-005: Reject wildcard CORS origin when credentials are enabled
    // Using wildcard origin (*) with credentials: true is invalid per CORS spec
    // When credentials are enabled, origin must be explicit (not wildcard)
    if (corsOrigin === '*' && appConfig.corsCredentials) {
      throw new Error(
        'Invalid CORS configuration: wildcard origin (*) cannot be used with credentials enabled. ' +
          'Either disable credentials or specify explicit origins via CORS_ORIGIN environment variable.'
      );
    }

    app.enableCors({
      origin: corsOrigin,
      credentials: appConfig.corsCredentials
    });
  }

  // Validation pipe with class-transformer
  // IMPORTANT: enableImplicitConversion is set to false to ensure strict type validation.
  // When enabled, class-transformer automatically converts strings like 'true' or 'false'
  // to boolean values before validation runs, which bypasses type checking. With this disabled,
  // strings remain strings and fail @IsBoolean() validation.
  //
  // If you need implicit conversion for specific fields, use the @Type() decorator from
  // class-transformer on those specific properties.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false
      }
    })
  );

  // Swagger documentation for all versions
  setupSwagger(app, configService);

  // Redoc documentation (alternative to Swagger UI)
  setupRedoc(app, configService);

  // Start server
  const port = appConfig.port;
  const host = appConfig.host;
  await app.listen(port, host);

  logServerStartupInfo(apiPrefix, host, port, swaggerConfig, versionConfig);
}

void bootstrap();
