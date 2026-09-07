/**
 * Redoc documentation setup
 *
 * Provides an alternative to Swagger UI with a cleaner, more modern
 * documentation interface powered by Redoc.
 *
 * @see https://github.com/Redocly/redoc
 */

import type { SwaggerConfig } from '../../config/swagger.config';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { IncomingMessage, ServerResponse } from 'http';

const logger = console;

/**
 * Setup Redoc documentation for the API
 *
 * Redoc is an alternative to Swagger UI that provides a cleaner,
 * more modern documentation interface with better mobile support.
 *
 * This function sets up Redoc at two paths for convenience:
 * - `/api/docs/redoc` - Under the API prefix
 * - `/docs/redoc` - At root level
 *
 * @param app - The NestJS application instance
 * @param configService - The NestJS config service
 *
 * @example
 * ```typescript
 * import { setupRedoc } from './common/swagger/redoc.setup';
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule);
 *   const configService = app.get(ConfigService);
 *
 *   setupSwagger(app, configService);
 *   setupRedoc(app, configService); // Add after setupSwagger
 *
 *   await app.listen(3000);
 * }
 * ```
 */
export function setupRedoc(app: INestApplication, configService: ConfigService): void {
  const swaggerConfig = configService.get<SwaggerConfig>('swagger');

  // Check if Swagger/Redoc is enabled
  if (!swaggerConfig?.enabled) {
    logger.log('Redoc documentation is disabled (Swagger is disabled)');
    return;
  }

  // Check if Redoc is explicitly disabled
  // @ts-expect-error - redocEnabled is a custom config option
  if (swaggerConfig?.redocEnabled === false) {
    logger.log('Redoc documentation is disabled via config');
    return;
  }

  const httpAdapter = app.getHttpAdapter();
  const redocHtml = generateRedocHtml(swaggerConfig);

  // Get API prefix from config
  const apiPrefix: string = swaggerConfig?.path?.replace('/docs', '') ?? 'api';

  // Serve Redoc at /api/docs/redoc (under API prefix)
  httpAdapter.get(`${apiPrefix}/docs/redoc`, (_req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(redocHtml);
  });

  // Also serve at root /docs/redoc for convenience
  httpAdapter.get('/docs/redoc', (_req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(redocHtml);
  });

  logger.log(`Redoc documentation available at /${apiPrefix}/docs/redoc`);
  logger.log(`Redoc documentation also available at /docs/redoc`);
}

/**
 * Generate the HTML for Redoc.
 *
 * Uses CDN-hosted Redoc standalone bundle to avoid npm package
 * dependency and webpack bundling issues.
 *
 * @param config - The Swagger configuration or undefined
 * @returns HTML string for the Redoc documentation page
 */
function generateRedocHtml(config: SwaggerConfig | undefined): string {
  const title = config?.title ?? 'API Documentation';
  const description = config?.description ?? 'API Documentation';

  // Use the main Swagger JSON endpoint as the spec URL
  // This is the index page that includes all API versions
  const apiPrefix = config?.path?.replace('/docs', '') ?? 'api';
  const specUrl = `/${apiPrefix}/docs-json`;

  return `<!DOCTYPE html>
<html>
  <head>
    <title>${title} - Redoc</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${description}">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                     "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji",
                     "Segoe UI Emoji", "Segoe UI Symbol";
      }
      redoc {
        display: block;
        height: 100vh;
      }
    </style>
  </head>
  <body>
    <redoc
      spec-url="${specUrl}"
      expand-responses="200,201"
      hide-hostname="true"
      lazy-rendering="true"
      native-scrollbars="true"
      show-objects="true"
      theme='{
        "colors": {
          "primary": {
            "main": "#3f51b5"
          },
          "success": {
            "main": "#4caf50"
          },
          "warning": {
            "main": "#ff9800"
          },
          "error": {
            "main": "#f44336"
          }
        },
        "typography": {
          "fontFamily": "-apple-system, BlinkMacSystemFont, \\"Segoe UI\\", Roboto, \\"Helvetica Neue\\", Arial, sans-serif",
          "fontSize": "14px",
          "lineHeight": "1.5"
        },
        "sidebar": {
          "backgroundColor": "#f7f9fc",
          "textColor": "#333333",
          "activeTextColor": "#3f51b5"
        },
        "rightPanel": {
          "backgroundColor": "#ffffff"
        }
      }'
    ></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
}
