/**
 * @module Health
 * @description Health check module with indicators for database, Redis, encryption, and outbox monitoring.
 */

export { OpsHealthModule } from './health.module';
export { OpsHealthController } from './controllers/health.controller';
export { HealthService } from './services/health.service';
export { HealthResponseDto } from './dto/health-response.dto';
export { HealthStatus, IndicatorStatus, OUTBOX_HEALTH_THRESHOLDS } from './health.constants';
export type {
  HealthIndicator,
  HealthIndicatorResult
} from './indicators/health-indicator.interface';
export { DatabaseHealthIndicator } from './indicators/database-health-indicator';
export { EncryptionHealthIndicator } from './indicators/encryption-health-indicator';
export { RedisHealthIndicator } from './indicators/redis-health-indicator';
export { OutboxHealthIndicator } from './indicators/outbox-health-indicator';
