import { createHash, randomUUID } from 'node:crypto';

import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { OutboxRepository } from '@package/events';
import { CacheService } from '@package/redis';

import { MAIN_DB } from '../../common/database/database.constants';
import { PUBLIC_AUTH_TENANT_ID } from '../auth/auth.constants';
import { AuthEventSchemaVersion } from '../auth/events';
import { AuthRepository } from '../auth/repositories/auth.repository';
import { AuthService } from '../auth/services/auth.service';

import type { BootstrapInstallDto } from './dto/bootstrap-install.dto';
import type {
  BootstrapInstallDto as BootstrapInstallResultDto,
  BootstrapStatusDto
} from './dto/bootstrap-response.dto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);
  private static readonly LOCK_KEY = 'lock:bootstrap-install';

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly authService: AuthService,
    private readonly cache: CacheService,
    private readonly outboxRepo: OutboxRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async getStatus(): Promise<BootstrapStatusDto> {
    const initialized = await this.authRepository.hasActiveSystemOwner();

    return {
      initialized,
      systemOwnerExists: initialized,
      installAllowed: !initialized
    };
  }

  async install(dto: BootstrapInstallDto): Promise<BootstrapInstallResultDto> {
    const lockValue = await this.cache.acquireLock(BootstrapService.LOCK_KEY, {
      timeout: 30,
      expiry: 60,
      retryInterval: 100
    });

    if (!lockValue) {
      throw new ConflictException('Bootstrap installation is already in progress.');
    }

    try {
      await this.installWithinLock(dto);
      return { success: true, requiresLogin: true };
    } finally {
      try {
        await this.cache.releaseLock(BootstrapService.LOCK_KEY, lockValue);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Bootstrap lock release warning: ${message}`);
      }
    }
  }

  private async installWithinLock(dto: BootstrapInstallDto): Promise<void> {
    const initialized = await this.authRepository.hasActiveSystemOwner();
    if (initialized) {
      await this.recordBootstrapAudit('bootstrap.install.rejected.audit', dto, {
        reason: 'already_initialized'
      });
      throw new ConflictException('Bootstrap installation is no longer available.');
    }

    await this.recordBootstrapAudit('bootstrap.install.attempted.audit', dto);

    await this.authService.bootstrapInstallFirstSystemOwner({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      organizationName: dto.organizationName,
      organizationSlug: dto.organizationSlug,
      firstName: dto.firstName,
      lastName: dto.lastName
    });

    this.logger.log('Bootstrap installation completed successfully');
  }

  private async recordBootstrapAudit(
    eventType: string,
    dto: BootstrapInstallDto,
    extraPayload?: Record<string, unknown>
  ): Promise<void> {
    const emailHash = createHash('sha256').update(dto.email.trim().toLowerCase()).digest('hex');

    await this.db.transaction(async (tx) => {
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType,
        aggregateId: 'bootstrap',
        aggregateVersion: '1',
        payload: {
          emailHash,
          organizationSlug: dto.organizationSlug,
          timestamp: new Date().toISOString(),
          ...extraPayload
        },
        correlationId: randomUUID(),
        causationId: randomUUID(),
        tenantId: PUBLIC_AUTH_TENANT_ID,
        schemaVersion: AuthEventSchemaVersion.V1_0
      });
    });
  }
}
