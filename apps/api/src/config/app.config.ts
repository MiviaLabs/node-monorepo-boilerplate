import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  apiPrefix: string;
  corsEnabled: boolean;
  corsOrigin: string;
  corsCredentials: boolean;
}

export default registerAs(
  'app',
  (): AppConfig => ({
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    host: process.env['HOST'] ?? '0.0.0.0',
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    apiPrefix: process.env['API_PREFIX'] ?? 'api',
    corsEnabled: process.env['CORS_ENABLED'] === 'true',
    corsOrigin: process.env['CORS_ORIGIN'] ?? '*',
    corsCredentials: process.env['CORS_CREDENTIALS'] !== 'false'
  })
);
