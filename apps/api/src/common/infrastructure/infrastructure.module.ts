import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '@package/redis';

import { TenantResolutionService } from '../services/tenant-resolution.service';
import { configServiceFromFactoryArgs } from '../utils/config-factory.util';

/**
 * Parse Redis URL and extract connection details
 * Supports both redis:// and rediss:// (SSL) protocols
 *
 * @example
 * parseRedisUrl('redis://localhost:6379/0')
 * // => { host: 'localhost', port: 6379, db: 0, password: undefined }
 *
 * parseRedisUrl('redis://:password@localhost:6379/1')
 * // => { host: 'localhost', port: 6379, db: 1, password: 'password' }
 */
function parseRedisUrl(redisUrl: string): {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
} {
  try {
    const url = new URL(redisUrl);

    const port = url.port ? parseInt(url.port, 10) : 6379;
    const db = url.pathname && url.pathname !== '/' ? parseInt(url.pathname.slice(1), 10) : 0;

    return {
      host: url.hostname,
      port,
      db,
      ...(url.username !== undefined && url.username !== '' && { username: url.username }),
      ...(url.password !== undefined && url.password !== '' && { password: url.password })
    };
  } catch {
    throw new Error(`Invalid REDIS_URL format: ${redisUrl}`);
  }
}

// Check if Redis is enabled via environment variable
const redisEnabled = process.env['REDIS_ENABLED'] !== 'false' && process.env['REDIS_URL'];

@Global()
@Module({
  imports: [
    // Only import RedisModule if enabled
    ...(redisEnabled
      ? [
          RedisModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (...args: unknown[]) => {
              const configService = configServiceFromFactoryArgs(args);
              // Check if REDIS_URL is provided
              const redisUrl = configService.get<string>('REDIS_URL');

              if (redisUrl) {
                // Parse REDIS_URL and use the new config format
                const connection = parseRedisUrl(redisUrl);

                return {
                  config: {
                    connection
                  },
                  enableGracefulShutdown: configService.get<boolean>(
                    'REDIS_GRACEFUL_SHUTDOWN',
                    true
                  )
                };
              }

              // Fall back to individual redis.* config keys (old format)
              const redisHost = configService.get<string>('redis.host', 'localhost');
              const redisPort = configService.get<number>('redis.port', 6379);
              const redisUsername = configService.get<string>('redis.username');
              const redisPassword = configService.get<string>('redis.password');
              const redisDb = configService.get<number>('redis.db', 0);
              const redisGracefulShutdown = configService.get<boolean>(
                'redis.gracefulShutdown',
                true
              );

              const connection: {
                host: string;
                port: number;
                db: number;
                username?: string;
                password?: string;
              } = {
                host: redisHost,
                port: redisPort,
                db: redisDb
              };

              if (redisUsername !== undefined) {
                connection.username = redisUsername;
              }

              if (redisPassword !== undefined) {
                connection.password = redisPassword;
              }

              return {
                config: {
                  connection
                },
                enableGracefulShutdown: redisGracefulShutdown
              };
            }
          })
        ]
      : [])
  ],
  providers: [TenantResolutionService],
  exports: [TenantResolutionService]
})
export class InfrastructureModule {}
