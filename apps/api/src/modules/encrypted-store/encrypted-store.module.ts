import { Module, forwardRef, type DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EncryptionModule } from '@package/encryption';
import { EventsModule } from '@package/events';

import { CreateEncryptedStoreEntryHandler, RotateEncryptedStoreKeyHandler } from './handlers/commands';
import { RetrieveEncryptedStoreEntryHandler } from './handlers/queries';
import { AuthModule } from '../auth/auth.module';
import { KmsRotationPollJob } from './jobs/kms-rotation-poll.job';
import { EncryptedStoreKeyRotationJob } from './jobs/encrypted-store-key-rotation.job';
import { EncryptedStoreEntryRepository } from './repositories/encrypted-store-entry.repository';
import { KmsRotationOrchestratorService } from './services/kms-rotation-orchestrator.service';
import { KmsRotationPollService } from './services/kms-rotation-poll.service';
import { EncryptedStoreKeyService } from './encrypted-store-key.service';
import { SecureVaultController } from './encrypted-store.controller';
import { EncryptedStoreService } from './encrypted-store.service';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * PII Vault Module
 *
 * Provides secure storage and retrieval of classified PII data using envelope encryption.
 * Integrates with @package/encryption for tenant-specific key management and @package/events
 * for access logging via outbox pattern.
 *
 * Features:
 * - Envelope encryption with tenant-specific keys from @package/encryption
 * - Automatic data classification using @package/types
 * - Transactional operations with outbox events via @package/events
 * - Access logging for compliance (SOC2, GDPR)
 * - Key rotation support with atomic re-encryption
 * - Poll-based KMS primary version detection for automated rotation
 * - Multi-tenancy with organization_id scoping
 *
 * Dependencies:
 * - EncryptionModule (@Global()): Provides EncryptionService and KmsProviderFactory
 *   MUST be imported in AppModule BEFORE SecureVaultModule
 * - EventsModule: Provides OutboxRepository for transactional event publishing
 * - EncryptedStoreEntryRepository: Data access layer for vault_entries table
 * - EncryptedStoreService: Business logic for vault operations
 * - EncryptedStoreKeyRotationJob: Processes vault key rotation jobs
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * import { SecureVaultModule } from './modules/encrypted-store/encrypted-store.module';
 *
 * @Module({
 *   imports: [
 *     EncryptionModule.forRootAsync({ ... }), // MUST be imported before SecureVaultModule
 *     SecureVaultModule.forRoot(),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [CqrsModule, forwardRef(() => AuthModule)],
  controllers: [SecureVaultController],
  providers: [
    // Repository
    EncryptedStoreEntryRepository,
    // Services
    EncryptedStoreService,
    EncryptedStoreKeyService,
    KmsRotationOrchestratorService,
    KmsRotationPollService,
    AuditOutboxPublisher,
    // CQRS Handlers
    CreateEncryptedStoreEntryHandler,
    RotateEncryptedStoreKeyHandler,
    RetrieveEncryptedStoreEntryHandler,
    // BullMQ job processors (auto-discovered by global QueuesModule via DiscoveryService)
    EncryptedStoreKeyRotationJob,
    KmsRotationPollJob
  ],
  exports: [
    // Export EncryptedStoreService for use by other modules
    EncryptedStoreService,
    // Export EncryptedStoreKeyService for tenant key management
    EncryptedStoreKeyService,
    // Export EncryptedStoreEntryRepository for direct data access if needed
    EncryptedStoreEntryRepository
  ]
})
export class SecureVaultModule {
  /**
   * Configure SecureVaultModule with required dependencies
   *
   * This method creates a dynamic module that imports EncryptionModule,
   * EventsModule, and AuthModule.
   *
   * Note: We import EncryptionModule class directly (not calling forRoot()).
   * The EncryptionModule.forRootAsync() in AppModule will handle initialization.
   * Importing the module class here ensures KmsProviderFactory is exported
   * and available for EncryptedStoreKeyService injection.
   *
   * AuthModule is imported because SecureVaultController uses @UseGuards(JwtAuthGuard),
   * which requires JwtService from AuthModule's JwtModule export.
   *
   * @returns DynamicModule with EncryptionModule and EventsModule imported
   */
  static forRoot(): DynamicModule {
    return {
      module: SecureVaultModule,
      imports: [
        // Import EncryptionModule to ensure KmsProviderFactory is available
        // The forRootAsync() call in AppModule handles initialization
        EncryptionModule,
        // Import EventsModule for OutboxRepository (transactional event publishing)
        EventsModule
      ]
    };
  }
}
