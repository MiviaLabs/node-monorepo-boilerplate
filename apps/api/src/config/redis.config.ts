import { registerAs } from '@nestjs/config';

/**
 * Redis Configuration
 *
 * Configures Redis connection settings for caching and pub/sub functionality.
 *
 * Environment Variables:
 * - REDIS_HOST: Redis server host (default: localhost)
 * - REDIS_PORT: Redis server port (default: 6379)
 * - REDIS_USER: Optional username for Redis 6+ ACL authentication
 * - REDIS_PASSWORD: Optional password for authentication
 * - REDIS_DB: Redis database number 0-15 (default: 0)
 * - REDIS_GRACEFUL_SHUTDOWN: Enable graceful shutdown on SIGTERM/SIGINT (default: true)
 */
export interface RedisConfig {
  /** Redis server host */
  host: string;
  /** Redis server port */
  port: number;
  /** Optional username for Redis 6+ ACL authentication */
  username?: string;
  /** Optional password for authentication */
  password?: string;
  /** Redis database number (0-15) */
  db: number;
  /** Enable graceful shutdown on SIGTERM/SIGINT */
  gracefulShutdown: boolean;
}

export default registerAs('redis', (): RedisConfig => {
  const config: RedisConfig = {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    db: parseInt(process.env['REDIS_DB'] ?? '0', 10),
    gracefulShutdown: process.env['REDIS_GRACEFUL_SHUTDOWN'] !== 'false'
  };

  const redisUser = process.env['REDIS_USER'];
  const redisPassword = process.env['REDIS_PASSWORD'];

  if (redisUser !== undefined) {
    config.username = redisUser;
  }

  if (redisPassword !== undefined) {
    config.password = redisPassword;
  }

  return config;
});
