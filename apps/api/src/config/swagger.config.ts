import { registerAs } from '@nestjs/config';

export interface SwaggerConfig {
  enabled: boolean;
  path: string;
  title: string;
  description: string;
  version: string;
  tag: string;
}

export default registerAs(
  'swagger',
  (): SwaggerConfig => ({
    enabled: process.env['SWAGGER_ENABLED'] === 'true',
    path: process.env['SWAGGER_PATH'] ?? 'api/docs',
    title: process.env['SWAGGER_TITLE'] ?? 'Platform Service REST API',
    description:
      process.env['SWAGGER_DESCRIPTION'] ??
      'Interactive OpenAPI specification and developer reference for Platform Services',
    version: process.env['API_VERSION'] ?? process.env['SWAGGER_VERSION'] ?? '1.0',
    tag: process.env['SWAGGER_TAG'] ?? 'Core Platform'
  })
);
