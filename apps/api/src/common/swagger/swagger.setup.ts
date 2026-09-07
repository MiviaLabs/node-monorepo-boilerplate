import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ApiVersionStatus } from '../../config/version.config';

import type { AppConfig } from '../../config/app.config';
import type { SwaggerConfig } from '../../config/swagger.config';
import type { ApiVersionConfig, ApiVersionInfo } from '../../config/version.config';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const logger = new Logger('SwaggerSetup');

/**
 * Setup Swagger documentation for a single API version.
 *
 * @param app - The NestJS application instance
 * @param versionInfo - Version configuration for the specific API version
 * @param versions - Array of all available API versions for cross-linking
 * @param title - Title for the Swagger documentation
 * @param tag - Default tag for the API operations
 * @param apiPrefix - API prefix path (e.g., 'api')
 */
function setupVersionedSwagger(
  app: INestApplication,
  versionInfo: ApiVersionInfo,
  versions: ApiVersionInfo[],
  title: string,
  tag: string,
  apiPrefix: string
): void {
  const versionDescription = buildVersionDescription(versionInfo, versions, apiPrefix);
  const isDeprecated = versionInfo.status === ApiVersionStatus.DEPRECATED;

  const options = new DocumentBuilder()
    .setTitle(`${title} - ${versionInfo.prefix.toUpperCase()}`)
    .setDescription(versionDescription)
    .setVersion(versionInfo.version)
    .addTag(tag)
    .addBearerAuth()
    // Server URL should be the base URL without the version prefix
    // The paths will include the full path including version
    .addServer('/', 'Base URL')
    .build();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const document = SwaggerModule.createDocument(app as any, options);

    // Setup Swagger at version-specific path
    const docsPrefix = apiPrefix ? `${apiPrefix}/docs` : 'docs';
    const versionPath = `${docsPrefix}/${versionInfo.prefix}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SwaggerModule.setup(versionPath, app as any, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
        // Disable online validator to avoid external requests
        validatorUrl: null,
        ...(isDeprecated && {
          defaultModelsExpandDepth: 0,
          defaultModelExpandDepth: 1
        })
      },
      customSiteTitle: `${title} - ${versionInfo.prefix.toUpperCase()}`,
      // Hide topbar for cleaner look
      customCss: '.swagger-ui .topbar { display: none }',
      // Use CDN for Swagger UI assets to avoid webpack bundling issues
      customJs: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js',
      customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css'
    });

    // Log that this version's docs have been created
    if (versionInfo.status === ApiVersionStatus.DEPRECATED) {
      logger.log(
        `Swagger docs for deprecated version ${versionInfo.prefix} available at /${versionPath}`
      );
    } else {
      logger.log(`Swagger docs for ${versionInfo.prefix} available at /${versionPath}`);
    }
  } catch (error) {
    // Distinguish between "no controllers" and actual errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('routes') || errorMessage.includes('controllers')) {
      logger.warn(`No controllers found for version ${versionInfo.prefix}, skipping Swagger docs`);
    } else {
      logger.error(
        `Failed to create Swagger docs for version ${versionInfo.prefix}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }
}

/**
 * Setup Swagger documentation for all API versions.
 *
 * Creates per-version documentation pages and an index page linking to all versions.
 *
 * @param app - The NestJS application instance
 * @param configService - NestJS ConfigService for accessing configuration
 */
export function setupSwagger(app: INestApplication, configService: ConfigService): void {
  const swaggerConfig = configService.get<SwaggerConfig>('swagger');

  if (!swaggerConfig?.enabled) {
    return;
  }

  const appConfig = configService.getOrThrow<AppConfig>('app');
  const versionConfig = configService.get<ApiVersionConfig>('version');
  const versions = versionConfig?.versions ?? [
    { prefix: 'v1', version: '1.0.0', status: ApiVersionStatus.ACTIVE }
  ];

  const title = swaggerConfig.title || 'Platform Service REST API';
  const description =
    swaggerConfig.description ||
    'Interactive OpenAPI specification and developer reference for Platform Services';
  const tag = swaggerConfig.tag || 'Core Platform';

  // Get API prefix (may be empty string for root API)
  const apiPrefix = appConfig.apiPrefix || '';

  // Create a separate document for each version
  for (const versionInfo of versions) {
    setupVersionedSwagger(app, versionInfo, versions, title, tag, apiPrefix);
  }

  // Create an index page that lists all available versions
  setupSwaggerIndex(app, versions, title, description, apiPrefix);
}

/**
 * Build version-specific description for Swagger docs.
 *
 * @param versionInfo - The API version information
 * @param allVersions - All available API versions for cross-linking
 * @param apiPrefix - API prefix path
 * @returns Markdown-formatted description string
 */
function buildVersionDescription(
  versionInfo: ApiVersionInfo,
  allVersions: ApiVersionInfo[],
  apiPrefix: string
): string {
  const statusEmoji =
    versionInfo.status === ApiVersionStatus.ACTIVE
      ? '✅'
      : versionInfo.status === ApiVersionStatus.DEPRECATED
        ? '⚠️'
        : '🔴';

  const apiPrefixWithSlash = apiPrefix ? `/${apiPrefix}` : '';

  let description = `# ${statusEmoji} API ${versionInfo.prefix.toUpperCase()}\n\n`;
  description += `**Semantic Version:** ${versionInfo.version}\n`;
  description += `**Status:** ${versionInfo.status.toUpperCase()}\n\n`;

  if (versionInfo.status === ApiVersionStatus.DEPRECATED) {
    description += `## ⚠️ Deprecation Warning\n\n`;
    description += `Notice: This release tier is **deprecated** and scheduled for decommissioning on **${versionInfo.sunsetDate ?? 'a future date'}**.\n\n`;
    description += `Clients should transition active integrations to the latest recommended release track as soon as possible.\n\n`;
  }

  description += `## Available Versions\n\n`;
  for (const v of allVersions) {
    const emoji =
      v.status === ApiVersionStatus.ACTIVE
        ? '✅'
        : v.status === ApiVersionStatus.DEPRECATED
          ? '⚠️'
          : '🔴';
    const docsPrefix = apiPrefix ? `${apiPrefix}/docs` : 'docs';
    const link = `/${docsPrefix}/${v.prefix}`;
    description += `- [${emoji} **${v.prefix}** (${v.version})](${link}) - ${v.status}${v.sunsetDate ? ` (Sunset: ${v.sunsetDate})` : ''}\n`;
  }

  description += `\n## Versioning Strategy\n\n`;
  description += `Routing is governed by **explicit path-based API versioning**. Prefix all endpoint queries with the target version identifier:\n\n`;
  description += `\`\`\`bash\n# Example request for ${versionInfo.prefix}\ncurl http://localhost:3000${apiPrefixWithSlash}/${versionInfo.prefix}/users\n\`\`\`\n\n`;

  description += `## Headers\n\n`;
  description += `| Header | Description |\n`;
  description += `|--------|-------------|\n`;
  description += `| \`X-API-Version\` | Active API version serving the response payload |\n`;
  description += `| \`X-API-Deprecated\` | Flag indicating whether the requested endpoint lifecycle is marked as deprecated |\n`;
  description += `| \`X-API-Sunset\` | Target date when the deprecated version prefix will be permanently decommissioned |\n`;
  description += `| \`X-API-Deprecation\` | Descriptive guidance and migration notice for deprecated contracts |\n`;

  return description;
}

/**
 * Setup Swagger index page with links to all versions.
 *
 * @param app - The NestJS application instance
 * @param versions - Array of all available API versions
 * @param title - Title for the documentation
 * @param baseDescription - Base description for the API
 * @param apiPrefix - API prefix path
 */
function setupSwaggerIndex(
  app: INestApplication,
  versions: ApiVersionInfo[],
  title: string,
  baseDescription: string,
  apiPrefix: string
): void {
  // Create a master document that links to all versions
  const options = new DocumentBuilder()
    .setTitle(title)
    .setDescription(buildIndexDescription(versions, baseDescription, apiPrefix))
    .setVersion('1.0.0')
    .addTag('API')
    .addBearerAuth()
    .addServer('/', 'Base URL')
    .build();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const document = SwaggerModule.createDocument(app as any, options);
    const docsPrefix = apiPrefix ? `${apiPrefix}/docs` : 'docs';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SwaggerModule.setup(docsPrefix, app as any, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'none'
      },
      customSiteTitle: title,
      // Use CDN for Swagger UI assets to avoid webpack bundling issues
      customJs: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js',
      customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css'
    });
    logger.log(`Swagger index page created at /${docsPrefix}`);
  } catch (error) {
    // Distinguish between "no controllers" and actual errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('routes') || errorMessage.includes('controllers')) {
      logger.warn('Could not create Swagger index page: no controllers found');
    } else {
      logger.error(
        `Failed to create Swagger index page: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }
}

/**
 * Build index description with links to all versions.
 *
 * @param versions - Array of all available API versions
 * @param baseDescription - Base description for the API
 * @param apiPrefix - API prefix path
 * @returns Markdown-formatted description string
 */
function buildIndexDescription(
  versions: ApiVersionInfo[],
  baseDescription: string,
  apiPrefix: string
): string {
  let description = `# ${baseDescription}\n\n`;
  description += `## Available API Versions\n\n`;
  description += `Explore available version-specific documentation portals below:\n\n`;

  const docsPrefix = apiPrefix ? `${apiPrefix}/docs` : 'docs';

  for (const v of versions) {
    const link = `/${docsPrefix}/${v.prefix}`;
    const emoji =
      v.status === ApiVersionStatus.ACTIVE
        ? '✅'
        : v.status === ApiVersionStatus.DEPRECATED
          ? '⚠️'
          : '🔴';
    description += `### [${emoji} ${v.prefix.toUpperCase()}](${link})\n\n`;
    description += `- **Version:** ${v.version}\n`;
    description += `- **Status:** ${v.status}\n`;
    if (v.sunsetDate) {
      description += `- **Sunset:** ${v.sunsetDate}\n`;
    }
    description += `- **Documentation:** [${link}](${link})\n\n`;
  }

  description += `## Usage\n\n`;
  description += `Include the version prefix in your API requests:\n\n`;
  description += `\`\`\`bash\n`;

  // Generate examples for each version dynamically
  const apiPrefixWithSlash = apiPrefix ? `/${apiPrefix}` : '';
  for (const v of versions) {
    description += `# Request to ${v.prefix} API\ncurl http://localhost:3000${apiPrefixWithSlash}/${v.prefix}/users\n\n`;
  }

  description += `\`\`\`\n`;

  return description;
}
