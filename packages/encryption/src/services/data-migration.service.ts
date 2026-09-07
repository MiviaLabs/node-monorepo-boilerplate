/**
 * Data Migration Service
 *
 * Orchestrates bulk data re-encryption for key rotation operations.
 * Provides batch processing, progress tracking, and resumability.
 *
 * @module encryption/services
 */

import {
  EntityTransformer,
  type IEncryptedFieldFormat,
  type IEntityTransformerOptions
} from '../decorators/entity-transformer';
import { DataMigrationError, MigrationValidationError } from '../errors';
import { withTracing, EncryptionOperation, type EncryptionTelemetryContext } from '../telemetry';

import type { IKmsProvider } from '../providers/kms-provider.interface';

/**
 * State machine for migration lifecycle.
 *
 * ```
 * PENDING → IN_PROGRESS → COMPLETED
 *               │
 *               ├──────→ FAILED
 *               │
 *               └──────→ PAUSED → IN_PROGRESS (resume)
 * ```
 *
 * @enum {string}
 */
export enum MigrationState {
  /** Migration has been created but not yet started */
  PENDING = 'pending',

  /** Migration is actively processing entities */
  IN_PROGRESS = 'in_progress',

  /** All entities processed successfully */
  COMPLETED = 'completed',

  /** Migration stopped due to an error */
  FAILED = 'failed',

  /** Migration paused by user (can be resumed) */
  PAUSED = 'paused'
}

/**
 * Real-time progress information for an active migration.
 *
 * This interface provides all metrics needed for:
 * - Progress bar display
 * - Time remaining estimates
 * - Success/failure tracking
 * - Audit logging
 *
 * @interface IMigrationProgress
 */
export interface IMigrationProgress {
  /** Unique identifier for this migration run */
  migrationId: string;

  /**
   * The organization/tenant ID this migration is scoped to.
   * Essential for audit logging and multi-tenancy compliance.
   */
  organizationId: string;

  /** Current lifecycle state of the migration */
  state: MigrationState;

  /** Total number of entities to process in this migration */
  total: number;

  /** Number of entities processed so far (succeeded + failed + skipped) */
  processed: number;

  /** Number of entities successfully re-encrypted */
  succeeded: number;

  /** Number of entities that failed re-encryption */
  failed: number;

  /** Number of entities skipped (no @Encrypted() fields required re-encryption) */
  skipped: number;

  /** Current batch number (1-indexed) */
  currentBatch: number;

  /** Total number of batches to process */
  totalBatches: number;

  /** Timestamp when migration execution began */
  startedAt?: Date;

  /** Timestamp when migration completed (success or failure) */
  completedAt?: Date;

  /**
   * Estimated seconds remaining until completion.
   * Calculated based on average processing time per entity.
   */
  estimatedTimeRemaining?: number;

  /** ID of the entity currently being processed (for debugging) */
  currentEntity?: string;
}

/**
 * Configuration options for data migration operations.
 *
 * These options control the behavior, performance, and error handling
 * of bulk re-encryption migrations.
 *
 * @interface IDataMigrationOptions
 */
export interface IDataMigrationOptions {
  /**
   * The organization/tenant ID for multi-tenancy isolation.
   * All repository operations will be scoped to this tenant.
   * Required for compliance with data isolation requirements.
   */
  organizationId: string;

  /**
   * The KEK ID currently wrapping the DEKs (source key).
   * This key must have decrypt permissions.
   */
  oldKeyId: string;

  /**
   * The KEK ID to re-wrap DEKs with (destination key).
   * This key must have encrypt permissions.
   */
  newKeyId: string;

  /**
   * KMS provider name for the old key.
   * Defaults to the service's default provider.
   */
  oldProvider?: string;

  /**
   * KMS provider name for the new key.
   * Enables cross-provider migrations (e.g., AWS KMS → GCP KMS).
   * Defaults to the service's default provider.
   */
  newProvider?: string;

  /**
   * Number of entities to process per batch.
   * Higher values improve throughput but use more memory.
   * @default 100
   */
  batchSize?: number;

  /**
   * Milliseconds to wait between batches.
   * Use to avoid overwhelming the database or KMS rate limits.
   * @default 0 (no delay)
   */
  batchDelay?: number;

  /**
   * Whether to continue processing when individual entities fail.
   * When true, failures are logged but don't stop the migration.
   * When false, the first failure aborts the entire migration.
   * @default false
   */
  continueOnError?: boolean;

  /**
   * When true, simulates the migration without modifying data.
   * Useful for testing migration scripts and estimating duration.
   * @default false
   */
  dryRun?: boolean;

  /**
   * Maximum concurrent entity processing within a batch.
   * Higher values improve speed but increase memory and KMS load.
   * @default 1 (sequential)
   */
  concurrency?: number;

  /**
   * Callback invoked with progress updates during migration.
   * Can be async; migration waits for callback to complete.
   */
  onProgress?: (progress: IMigrationProgress) => void | Promise<void>;
}

/**
 * Final result of a completed data migration.
 *
 * This interface provides a comprehensive summary for:
 * - Audit logging and compliance reporting
 * - Error analysis and retry planning
 * - Performance metrics and optimization
 *
 * @interface IDataMigrationResult
 */
export interface IDataMigrationResult {
  /** Unique identifier for this migration run */
  migrationId: string;

  /** Total number of entities processed */
  total: number;

  /** Number of entities successfully re-encrypted */
  succeeded: number;

  /** Number of entities that failed re-encryption */
  failed: number;

  /**
   * Number of entities that were processed but had no @Encrypted() fields
   * and therefore did not require re-encryption. Invariant:
   *   total == succeeded + failed + skipped
   */
  skipped: number;

  /**
   * Detailed error information for each failed entity.
   * Use for debugging and selective retry operations.
   */
  errors: Array<{
    /** ID of the failed entity */
    entityId: string;
    /** Type/table name of the entity */
    entityName: string;
    /** The error that occurred (always a DataMigrationError for sanitized error handling) */
    error: DataMigrationError;
  }>;

  /** Total migration duration in milliseconds */
  duration: number;

  /**
   * Whether the migration completed with zero failures.
   * Strictly true only when all entities succeeded.
   */
  success: boolean;

  /**
   * Whether the migration completed with some failures.
   * True when continueOnError was enabled and at least one entity failed.
   * Use this to detect partial completion scenarios.
   */
  completedWithErrors: boolean;

  /** Final lifecycle state of the migration */
  state: MigrationState;

  /** Number of batches that were processed */
  batchesProcessed: number;
}

/**
 * Internal metadata for tracking migration state.
 *
 * This is stored in-memory during migration execution and enables:
 * - Progress tracking and reporting
 * - Resumability after pause or failure
 * - Retry of failed entities
 *
 * @interface IMigrationMetadata
 * @internal
 */
export interface IMigrationMetadata {
  /** Unique migration identifier */
  migrationId: string;

  /** Name of the entity type being migrated */
  entityName: string;

  /** Original options used to start the migration */
  options: IDataMigrationOptions;

  /** Current progress snapshot */
  progress: IMigrationProgress;

  /** Set of entity IDs that have been successfully processed */
  processedIds: Set<string>;

  /** Set of entity IDs that failed processing */
  failedIds: Set<string>;

  /** Timestamp when this migration was created */
  createdAt: Date;

  /** Timestamp of the last progress update */
  updatedAt: Date;
}

/**
 * Database-agnostic repository interface for entity access with tenant isolation.
 *
 * Implement this interface to connect the migration service to your
 * data layer. Supports Drizzle, Prisma, TypeORM, raw SQL, or any
 * other data access pattern.
 *
 * **IMPORTANT**: All methods require an `organizationId` parameter to enforce
 * multi-tenancy isolation. Implementations MUST filter/scope all queries
 * by the provided organization ID to prevent cross-tenant data access.
 *
 * @typeParam T - The entity type being migrated (must have an 'id' field)
 *
 * @example Drizzle implementation with tenant isolation
 * ```typescript
 * const userRepository: IEntityRepository<User> = {
 *   entityName: 'users',
 *
 *   async findAll(organizationId, { limit, offset }) {
 *     return db.select().from(users)
 *       .where(eq(users.organizationId, organizationId))
 *       .limit(limit)
 *       .offset(offset);
 *   },
 *
 *   async save(organizationId, user) {
 *     // Verify entity belongs to organization before update
 *     const [updated] = await db.update(users)
 *       .set(user)
 *       .where(and(eq(users.id, user.id), eq(users.organizationId, organizationId)))
 *       .returning();
 *     return updated;
 *   },
 *
 *   async saveBatch(organizationId, users) {
 *     return Promise.all(users.map(u => this.save(organizationId, u)));
 *   },
 *
 *   async count(organizationId) {
 *     const [{ count }] = await db.select({ count: sql<number>`count(*)` })
 *       .from(users)
 *       .where(eq(users.organizationId, organizationId));
 *     return count;
 *   }
 * };
 * ```
 *
 * @interface IEntityRepository
 */
export interface IEntityRepository<T extends Record<string, unknown>> {
  /**
   * Retrieves entities with pagination support, scoped to an organization.
   *
   * @param organizationId - The tenant/organization ID for isolation
   * @param options - Pagination options
   * @param options.limit - Maximum entities to return
   * @param options.offset - Number of entities to skip
   * @returns Promise resolving to array of entities belonging to the organization
   */
  findAll(organizationId: string, options?: { limit?: number; offset?: number }): Promise<T[]>;

  /**
   * Persists an entity (update or insert), scoped to an organization.
   *
   * @param organizationId - The tenant/organization ID for isolation
   * @param entity - Entity to save
   * @returns Promise resolving to the saved entity
   */
  save(organizationId: string, entity: T): Promise<T>;

  /**
   * Persists multiple entities in a batch, scoped to an organization.
   *
   * @param organizationId - The tenant/organization ID for isolation
   * @param entities - Array of entities to save
   * @returns Promise resolving to saved entities
   */
  saveBatch(organizationId: string, entities: T[]): Promise<T[]>;

  /**
   * Returns the total count of entities for an organization.
   *
   * @param organizationId - The tenant/organization ID for isolation
   * @returns Promise resolving to entity count
   */
  count(organizationId: string): Promise<number>;

  /**
   * Human-readable name for logging and error messages.
   */
  entityName: string;
}

/**
 * Create a unique migration ID
 */
function createMigrationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `migration-${timestamp}-${random}`;
}

/**
 * Orchestrates bulk data re-encryption for key rotation and provider migration.
 *
 * This service handles the complexity of migrating large volumes of encrypted
 * data with features designed for production safety and operational excellence.
 *
 * ## Use Cases
 *
 * 1. **Key Rotation**: Re-wrap all DEKs with a new KEK for security compliance
 * 2. **Provider Migration**: Move from one KMS provider to another (e.g., AWS → GCP)
 * 3. **Algorithm Upgrades**: Migrate to stronger encryption algorithms
 * 4. **Multi-tenancy**: Migrate tenant data to dedicated keys
 *
 * ## Features
 *
 * ### Batch Processing
 * - Processes entities in configurable batches to control memory usage
 * - Supports batch delays to respect KMS rate limits
 * - Configurable concurrency within batches
 *
 * ### Progress Tracking
 * - Real-time progress callbacks with ETAs
 * - Persists processed entity IDs for resumability
 * - Tracks success/failure counts per entity
 *
 * ### Error Handling
 * - Continue-on-error mode for graceful degradation
 * - Detailed error collection for failed entities
 * - Automatic retry support via failed entity tracking
 *
 * ### Safety Features
 * - Dry-run mode for migration preview
 * - Provider validation before starting
 * - Pause/resume/cancel operations
 * - Full OpenTelemetry instrumentation
 *
 * ## Security Warning
 *
 * **ALWAYS test migrations in a staging environment before running in production.**
 *
 * Migrations involve:
 * - KMS API calls (costs, rate limits)
 * - Database writes (potential data corruption if interrupted)
 * - Memory usage (large batches with high concurrency)
 *
 * Recommended pre-production checklist:
 * 1. Run with dryRun=true to validate without modifying data
 * 2. Test with a small batchSize (10-50) before scaling up
 * 3. Verify KMS rate limits can handle the migration throughput
 * 4. Ensure database backup exists before starting
 * 5. Monitor migration progress and have rollback procedures ready
 *
 * @example Complete migration workflow with tenant isolation and progress tracking
 * ```typescript
 * const migrationService = new DataMigrationService(
 *   (name) => providers.get(name),
 *   'aws-kms'
 * );
 *
 * // Create a repository adapter with tenant isolation
 * const userRepository: IEntityRepository<User> = {
 *   entityName: 'users',
 *   findAll: async (orgId, { limit, offset }) =>
 *     db.users.findMany({ where: { organizationId: orgId }, take: limit, skip: offset }),
 *   save: async (orgId, user) =>
 *     db.users.update({ where: { id: user.id, organizationId: orgId }, data: user }),
 *   saveBatch: async (orgId, users) =>
 *     Promise.all(users.map(u => db.users.update({ where: { id: u.id, organizationId: orgId }, data: u }))),
 *   count: async (orgId) =>
 *     db.users.count({ where: { organizationId: orgId } })
 * };
 *
 * // First, preview the migration for a specific organization
 * const preview = await migrationService.previewMigration(userRepository, {
 *   organizationId: 'org-123',
 *   oldKeyId: 'alias/production-key-2024',
 *   newKeyId: 'alias/production-key-2025',
 *   batchSize: 100
 * });
 * console.log(`Preview: ${preview.total} entities, ${preview.duration}ms`);
 *
 * // If preview looks good, run the actual migration
 * const result = await migrationService.migrateEntities(userRepository, {
 *   organizationId: 'org-123',
 *   oldKeyId: 'alias/production-key-2024',
 *   newKeyId: 'alias/production-key-2025',
 *   batchSize: 100,
 *   continueOnError: true,
 *   onProgress: (progress) => {
 *     const pct = Math.round((progress.processed / progress.total) * 100);
 *     console.log(`Migration ${progress.migrationId}: ${pct}% complete`);
 *     console.log(`  ETA: ${progress.estimatedTimeRemaining}s remaining`);
 *   }
 * });
 *
 * console.log(`Migration complete: ${result.succeeded} succeeded, ${result.failed} failed`);
 * if (result.errors.length > 0) {
 *   console.error('Failed entities:', result.errors.map(e => e.entityId));
 * }
 * ```
 *
 * @see {@link KeyRotationService} for lower-level key rotation operations
 * @see {@link EncryptionService} for encryption/decryption operations
 */
export class DataMigrationService {
  private readonly activeMigrations = new Map<string, IMigrationMetadata>();
  private readonly transformer: EntityTransformer;

  constructor(
    private readonly providerGetter: (name?: string) => IKmsProvider | undefined,
    private readonly defaultProviderName?: string
  ) {
    const transformerOptions: IEntityTransformerOptions = {
      getProvider: this.providerGetter
    };
    if (defaultProviderName !== undefined) {
      transformerOptions.defaultProvider = defaultProviderName;
    }
    this.transformer = new EntityTransformer(transformerOptions);
  }

  /**
   * Get a KMS provider with fallback to default
   */
  private getKmsProvider(providerName?: string): IKmsProvider {
    const provider = this.providerGetter(providerName ?? this.defaultProviderName);

    if (!provider) {
      throw new MigrationValidationError(
        `KMS provider '${providerName ?? this.defaultProviderName ?? 'default'}' not found`
      );
    }

    return provider;
  }

  /**
   * Executes a bulk data migration, re-encrypting all entities from old key to new key.
   *
   * This method orchestrates the entire migration lifecycle:
   * 1. Validates provider availability
   * 2. Counts total entities and plans batches
   * 3. Processes entities in batches with progress tracking
   * 4. Handles errors according to continueOnError setting
   * 5. Returns comprehensive result with metrics
   *
   * @typeParam T - Entity type being migrated (must have 'id' field)
   * @param repository - Repository adapter for entity access
   * @param options - Migration configuration options
   * @param options.oldKeyId - Current KEK ID (source)
   * @param options.newKeyId - Target KEK ID (destination)
   * @param options.batchSize - Entities per batch (default: 100)
   * @param options.continueOnError - Whether to continue on failures (default: false)
   * @param options.dryRun - Preview mode without modifications (default: false)
   * @param options.onProgress - Progress callback function
   * @returns Promise resolving to migration result with success/failure metrics
   * @throws {DataMigrationError} When migration fails and continueOnError is false
   * @throws {MigrationValidationError} When provider validation fails
   *
   * @example
   * ```typescript
   * const result = await migrationService.migrateEntities(userRepository, {
   *   organizationId: 'org-123',
   *   oldKeyId: 'alias/key-2024',
   *   newKeyId: 'alias/key-2025',
   *   batchSize: 50,
   *   continueOnError: true,
   *   onProgress: (p) => console.log(`${p.processed}/${p.total}`)
   * });
   * ```
   */
  async migrateEntities<T extends Record<string, unknown>>(
    repository: IEntityRepository<T>,
    options: IDataMigrationOptions
  ): Promise<IDataMigrationResult> {
    const migrationId = createMigrationId();
    const startTime = Date.now();

    // Validate and sanitize batchSize to prevent infinite loops
    const rawBatchSize = options.batchSize ?? 100;
    if (!Number.isFinite(rawBatchSize) || Math.floor(rawBatchSize) <= 0) {
      throw new MigrationValidationError(
        `batchSize must be a positive finite integer, received: ${rawBatchSize}`
      );
    }
    const batchSize = Math.floor(rawBatchSize);

    // Validate and sanitize concurrency to prevent infinite loops
    const rawConcurrency = options.concurrency ?? 1;
    if (!Number.isFinite(rawConcurrency) || Math.floor(rawConcurrency) <= 0) {
      throw new MigrationValidationError(
        `concurrency must be a positive finite integer, received: ${rawConcurrency}`
      );
    }
    const concurrency = Math.floor(rawConcurrency);

    // Initialize migration metadata
    const metadata: IMigrationMetadata = {
      migrationId,
      entityName: repository.entityName,
      options,
      progress: {
        migrationId,
        organizationId: options.organizationId,
        state: MigrationState.PENDING,
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        currentBatch: 0,
        totalBatches: 0,
        startedAt: new Date()
      },
      processedIds: new Set<string>(),
      failedIds: new Set<string>(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.activeMigrations.set(migrationId, metadata);

    // Build telemetry context
    const telemetryCtx: EncryptionTelemetryContext = {
      ...(options.newProvider !== undefined && { provider: options.newProvider }),
      ...(options.oldProvider !== undefined &&
        options.newProvider === undefined && {
          provider: options.oldProvider
        }),
      keyId: options.newKeyId,
      metadata: {
        operation: 'data_migration',
        migrationId,
        entityName: repository.entityName,
        batchSize: String(batchSize),
        dryRun: String(options.dryRun ?? false),
        concurrency: String(concurrency)
      }
    };

    try {
      return await withTracing(
        EncryptionOperation.DATA_MIGRATION,
        async () => {
          // Update state to in progress
          metadata.progress.state = MigrationState.IN_PROGRESS;
          metadata.progress.startedAt = new Date();
          await this.notifyProgress(metadata);

          // Get total count (scoped to organization)
          const total = await repository.count(options.organizationId);
          metadata.progress.total = total;
          metadata.progress.totalBatches = Math.ceil(total / batchSize);
          await this.notifyProgress(metadata);

          // Validate providers are available
          await this.validateProviders(options);

          const errors: Array<{ entityId: string; entityName: string; error: DataMigrationError }> =
            [];
          let offset = 0;

          // Bug A4: detect end-of-data via the actual returned batch size
          // rather than the pre-sampled `total`. Pre-sampled `total` becomes
          // stale when rows are inserted (or deleted) during the migration:
          //   - inserts: loop exits before visiting the new rows
          //   - deletes: loop spins or terminates early on stale count
          // The returned batch length is the authoritative end-of-data signal.
          // Loop guard: at least one batch must be processed when total > 0;
          // thereafter, terminate as soon as findAll returns fewer rows
          // than batchSize (or zero rows).
          let lastBatchSize = batchSize > 0 ? batchSize : 1;
          // Safety cap on iterations to prevent infinite loops if a buggy
          // repository keeps returning full batches forever.
          const maxIterations = Math.max(1000, Math.ceil(total / Math.max(batchSize, 1)) + 100);
          let iteration = 0;

          while (iteration < maxIterations) {
            iteration++;

            // Check migration state before processing each batch.
            // External code can modify metadata.progress.state via pause/cancel methods.
            await this.checkMigrationState(metadata, migrationId);

            // Fetch batch (scoped to organization)
            const entities = await repository.findAll(options.organizationId, {
              limit: batchSize,
              offset
            });

            lastBatchSize = entities.length;

            // End-of-data sentinel: findAll returned fewer rows than batchSize
            // (including zero rows). This is the only authoritative signal.
            if (entities.length < batchSize) {
              // Process whatever was returned (if any) before terminating.
              if (entities.length > 0) {
                const entitiesToProcess = entities.filter(
                  (entity) => !metadata.processedIds.has(String(entity['id']))
                );
                const batchResult = await this.processBatch(
                  entitiesToProcess,
                  repository,
                  options,
                  metadata,
                  errors,
                  concurrency
                );
                metadata.progress.processed += batchResult.processed;
                metadata.progress.succeeded += batchResult.succeeded;
                metadata.progress.failed += batchResult.failed;
                metadata.progress.skipped += batchResult.skipped;
                metadata.progress.currentBatch++;
                await this.notifyProgress(metadata);
              }
              break;
            }

            // Filter out already processed entities (for resumability)
            const entitiesToProcess = entities.filter(
              (entity) => !metadata.processedIds.has(String(entity['id']))
            );

            // Process batch with bounded concurrency
            const batchResult = await this.processBatch(
              entitiesToProcess,
              repository,
              options,
              metadata,
              errors,
              concurrency
            );

            // Update progress
            metadata.progress.processed += batchResult.processed;
            metadata.progress.succeeded += batchResult.succeeded;
            metadata.progress.failed += batchResult.failed;
            metadata.progress.skipped += batchResult.skipped;
            metadata.progress.currentBatch++;

            // Calculate estimated time remaining
            if (metadata.progress.processed > 0) {
              const elapsed = Date.now() - startTime;
              const avgTimePerEntity = elapsed / metadata.progress.processed;
              const remaining = Math.max(0, total - metadata.progress.processed);
              metadata.progress.estimatedTimeRemaining = (remaining * avgTimePerEntity) / 1000;
            }

            await this.notifyProgress(metadata);

            // Move to next batch
            offset += batchSize;

            // Add delay between batches if specified
            if (options.batchDelay && offset < total) {
              await this.delay(options.batchDelay);
            }
          }

          // If the safety cap was hit, surface a warning via the result.
          // We intentionally do not throw — partial progress is recoverable
          // on the next migration run, and the warning is informational.
          if (iteration >= maxIterations) {
            console.warn(
              `[DataMigrationService] Migration ${migrationId} reached iteration cap ${maxIterations}; ` +
                `repository returned full batches repeatedly. Aborting to prevent infinite loop.`
            );
          }
          // Reference lastBatchSize to satisfy lint while keeping the
          // diagnostic available for future instrumentation.
          void lastBatchSize;

          // Determine final state
          const duration = Date.now() - startTime;
          // Success is strictly true only when all entities succeeded (zero failures)
          const success = metadata.progress.failed === 0;
          // CompletedWithErrors signals partial completion when continueOnError allowed failures
          const completedWithErrors =
            options.continueOnError === true && metadata.progress.failed > 0;

          // State is COMPLETED if fully successful OR if completed with errors (continueOnError)
          metadata.progress.state =
            success || completedWithErrors ? MigrationState.COMPLETED : MigrationState.FAILED;
          metadata.progress.completedAt = new Date();

          const result: IDataMigrationResult = {
            migrationId,
            total: metadata.progress.processed,
            succeeded: metadata.progress.succeeded,
            failed: metadata.progress.failed,
            skipped: metadata.progress.skipped,
            errors,
            duration,
            success,
            completedWithErrors,
            state: metadata.progress.state,
            batchesProcessed: metadata.progress.currentBatch
          };

          // Clean up completed migration
          if (metadata.progress.state === MigrationState.COMPLETED) {
            this.activeMigrations.delete(migrationId);
          }

          return result;
        },
        telemetryCtx
      );
    } catch (error) {
      // Update state to failed
      metadata.progress.state = MigrationState.FAILED;
      metadata.progress.completedAt = new Date();
      await this.notifyProgress(metadata);

      throw new DataMigrationError(
        `Migration ${migrationId} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Process a batch of entities with bounded concurrency.
   *
   * Uses a chunk-based approach to run up to `concurrency` simultaneous
   * entity processing tasks. Each chunk is processed in parallel using
   * Promise.all, then results are aggregated before moving to the next chunk.
   *
   * @param entities - Entities to process in this batch
   * @param repository - Repository for saving processed entities
   * @param options - Migration options
   * @param metadata - Migration state tracking
   * @param errors - Array to collect errors
   * @param concurrency - Maximum concurrent entity tasks (default: 1)
   * @returns Aggregated results for the batch
   */
  private async processBatch<T extends Record<string, unknown>>(
    entities: T[],
    repository: IEntityRepository<T>,
    options: IDataMigrationOptions,
    metadata: IMigrationMetadata,
    errors: Array<{ entityId: string; entityName: string; error: DataMigrationError }>,
    concurrency: number = 1
  ): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    // Ensure concurrency is a positive integer to prevent infinite loops
    const safeConcurrency = concurrency > 0 ? Math.floor(concurrency) : 1;

    // Process entities in chunks of size `concurrency`
    for (let i = 0; i < entities.length; i += safeConcurrency) {
      const chunk = entities.slice(i, i + safeConcurrency);

      // Process chunk in parallel
      const chunkResults = await Promise.all(
        chunk.map(async (entity) => {
          return this.processEntity(entity, repository, options, metadata, errors);
        })
      );

      // Aggregate results from this chunk
      for (const result of chunkResults) {
        processed += result.processed;
        succeeded += result.succeeded;
        failed += result.failed;
        skipped += result.skipped;

        // If continueOnError is false and we encountered a failure, throw
        if (result.error && !options.continueOnError) {
          throw result.error;
        }
      }
    }

    return { processed, succeeded, failed, skipped };
  }

  /**
   * Process a single entity for migration.
   *
   * Extracted from processBatch to enable parallel execution.
   * Returns result object instead of throwing to allow batch-level error handling.
   *
   * @param entity - Entity to process
   * @param repository - Repository for saving
   * @param options - Migration options
   * @param metadata - Migration state tracking
   * @param errors - Array to collect errors
   * @returns Result with counts and optional error
   */
  private async processEntity<T extends Record<string, unknown>>(
    entity: T,
    repository: IEntityRepository<T>,
    options: IDataMigrationOptions,
    metadata: IMigrationMetadata,
    errors: Array<{ entityId: string; entityName: string; error: DataMigrationError }>
  ): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    error?: DataMigrationError;
  }> {
    const entityId = String(entity['id']);
    metadata.progress.currentEntity = entityId;

    try {
      // Check if already processed
      if (metadata.processedIds.has(entityId)) {
        return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
      }

      // Check if entity has encrypted fields
      const hasEncryptedFields = this.entityHasEncryptedFields(entity);
      if (!hasEncryptedFields) {
        metadata.processedIds.add(entityId);
        return { processed: 1, succeeded: 0, failed: 0, skipped: 1 };
      }

      // Re-encrypt entity fields with the new key
      const reencrypted = await this.reencryptEntityFields(entity, options);

      // Save entity (unless dry run), scoped to organization
      if (!options.dryRun) {
        await repository.save(options.organizationId, reencrypted);
      }

      // Mark as processed
      metadata.processedIds.add(entityId);
      return { processed: 1, succeeded: 1, failed: 0, skipped: 0 };
    } catch (error) {
      // Create a sanitized error message to prevent PII leakage.
      // The raw error (which may contain sensitive data) is preserved only as the cause
      // for debugging purposes, but the public message remains generic.
      const errorCode = this.getErrorCode(error);
      const migrationError = new DataMigrationError(
        `Migration failed for entity ${entityId}: ${errorCode}`,
        { cause: error }
      );

      errors.push({
        entityId,
        entityName: repository.entityName,
        error: migrationError
      });

      metadata.failedIds.add(entityId);

      return { processed: 1, succeeded: 0, failed: 1, skipped: 0, error: migrationError };
    }
  }

  /**
   * Check if entity has encrypted fields
   */
  private entityHasEncryptedFields<T extends Record<string, unknown>>(entity: T): boolean {
    for (const value of Object.values(entity)) {
      if (this.isEncryptedField(value)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a value is an encrypted field
   */
  private isEncryptedField(value: unknown): value is IEncryptedFieldFormat {
    return (
      typeof value === 'object' &&
      value !== null &&
      'data' in value &&
      'key' in value &&
      'iv' in value &&
      'tag' in value
    );
  }

  /**
   * Extracts a sanitized error code from an error without exposing PII.
   *
   * Maps known error types to safe, generic codes. Unknown errors are
   * classified as 'INTERNAL_ERROR' to prevent leaking sensitive details.
   *
   * @param error - The error to classify
   * @returns A sanitized error code string safe for logging and external exposure
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof MigrationValidationError) {
      return 'VALIDATION_ERROR';
    }
    if (error instanceof DataMigrationError) {
      return 'MIGRATION_ERROR';
    }
    if (error instanceof Error) {
      // Map common error types to safe codes without exposing the message
      const errorName = error.name;
      if (errorName === 'TypeError') {
        return 'TYPE_ERROR';
      }
      if (errorName === 'RangeError') {
        return 'RANGE_ERROR';
      }
      if (errorName === 'SyntaxError') {
        return 'SYNTAX_ERROR';
      }
      // Check for known encryption-related error patterns by error name only
      if (errorName.includes('Encryption') || errorName.includes('Decryption')) {
        return 'ENCRYPTION_ERROR';
      }
      if (errorName.includes('Kms') || errorName.includes('KMS')) {
        return 'KMS_ERROR';
      }
    }
    // Default to a generic internal error code
    return 'INTERNAL_ERROR';
  }

  /**
   * Re-encrypts an entity's encrypted fields with a new key.
   *
   * Extracted helper that builds re-encryption options, calls the transformer,
   * and updates version metadata on encrypted fields.
   *
   * @param entity - Entity with encrypted fields to re-encrypt
   * @param options - Migration options containing key IDs and providers
   * @returns The re-encrypted entity with updated version metadata
   */
  private async reencryptEntityFields<T extends Record<string, unknown>>(
    entity: T,
    options: IDataMigrationOptions
  ): Promise<T> {
    const reencryptOptions: {
      oldKeyId: string;
      newKeyId: string;
      oldProvider?: string;
      newProvider?: string;
    } = {
      oldKeyId: options.oldKeyId,
      newKeyId: options.newKeyId
    };
    if (options.oldProvider !== undefined) {
      reencryptOptions.oldProvider = options.oldProvider;
    }
    if (options.newProvider !== undefined) {
      reencryptOptions.newProvider = options.newProvider;
    }

    const reencrypted = await this.transformer.reencryptEntity(entity, reencryptOptions);
    this.updateEncryptedFieldVersions(reencrypted, options.newKeyId);

    return reencrypted;
  }

  /**
   * Update version metadata in encrypted fields
   */
  private updateEncryptedFieldVersions<T extends Record<string, unknown>>(
    entity: T,
    newKeyId: string
  ): void {
    for (const [key, value] of Object.entries(entity)) {
      if (this.isEncryptedField(value)) {
        // Add version metadata if not present
        if (!('version' in value)) {
          (entity as Record<string, unknown>)[key] = {
            ...value,
            version: newKeyId
          };
        } else {
          const encryptedField = (
            entity as Record<string, IEncryptedFieldFormat & { version?: string }>
          )[key];
          if (encryptedField) {
            encryptedField.version = newKeyId;
          }
        }
      }
    }
  }

  /**
   * Validate that both old and new providers are available and healthy.
   *
   * Uses `healthCheck()` as the canonical availability check. For most providers
   * (GCP KMS, AWS KMS, Azure KeyVault, Vault Transit), `healthCheck()` delegates
   * to `isAvailable()`. For specialized providers (EnvVar, GcpSecretManager),
   * `healthCheck()` performs additional validation beyond basic availability.
   */
  private async validateProviders(options: IDataMigrationOptions): Promise<void> {
    const oldProvider = this.getKmsProvider(options.oldProvider);
    const newProvider = this.getKmsProvider(options.newProvider);

    // Check health of old provider (includes availability check)
    try {
      const oldHealthy = await oldProvider.healthCheck();
      if (!oldHealthy) {
        throw new MigrationValidationError(
          `Old provider '${options.oldProvider ?? oldProvider.name}' is not available or failed health check`
        );
      }
    } catch (error) {
      if (error instanceof MigrationValidationError) {
        throw error;
      }
      throw new MigrationValidationError(
        `Old provider '${options.oldProvider ?? oldProvider.name}' health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Check health of new provider (includes availability check)
    try {
      const newHealthy = await newProvider.healthCheck();
      if (!newHealthy) {
        throw new MigrationValidationError(
          `New provider '${options.newProvider ?? newProvider.name}' is not available or failed health check`
        );
      }
    } catch (error) {
      if (error instanceof MigrationValidationError) {
        throw error;
      }
      throw new MigrationValidationError(
        `New provider '${options.newProvider ?? newProvider.name}' health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Notify progress callback
   */
  private async notifyProgress(metadata: IMigrationMetadata): Promise<void> {
    if (metadata.options.onProgress) {
      await metadata.options.onProgress({ ...metadata.progress });
    }
  }

  /**
   * Delay for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Waits for a paused migration to be resumed or cancelled.
   *
   * Polls the migration state every 500ms until it transitions out of PAUSED.
   * This allows external callers to pause/resume/cancel the migration.
   *
   * @param metadata - The migration metadata to monitor
   */
  private async waitForResume(metadata: IMigrationMetadata): Promise<void> {
    const pollInterval = 500; // 500ms poll interval
    while (metadata.progress.state === MigrationState.PAUSED) {
      await this.delay(pollInterval);
    }
  }

  /**
   * Checks the migration state and handles PAUSED/FAILED/CANCELLED states.
   *
   * This method is called at the start of each batch iteration to check if
   * external code has paused or cancelled the migration via the control methods.
   *
   * @param metadata - The migration metadata to check
   * @param migrationId - The migration ID for error messages
   * @throws {DataMigrationError} If the migration was cancelled or failed
   */
  private async checkMigrationState(
    metadata: IMigrationMetadata,
    migrationId: string
  ): Promise<void> {
    // Read state directly from metadata (may be modified externally)
    const state = metadata.progress.state;

    if (state === MigrationState.FAILED) {
      throw new DataMigrationError(`Migration ${migrationId} was cancelled or failed`);
    }

    // Handle PAUSED state: poll until resumed or cancelled
    if (state === MigrationState.PAUSED) {
      await this.waitForResume(metadata);
      // After resume, re-check state in case it was cancelled during pause
      if (metadata.progress.state === MigrationState.FAILED) {
        throw new DataMigrationError(`Migration ${migrationId} was cancelled while paused`);
      }
    }
  }

  /**
   * Retrieves the current progress of an active migration.
   *
   * Use this method to check on migrations started in background tasks
   * or to implement custom progress displays.
   *
   * **Multi-tenancy**: The organizationId parameter enforces tenant isolation.
   * Returns undefined if the migration belongs to a different organization.
   *
   * @param organizationId - The organization ID for tenant isolation
   * @param migrationId - The unique migration identifier
   * @returns Current progress snapshot, or undefined if migration not found or belongs to another org
   *
   * @example
   * ```typescript
   * const progress = migrationService.getMigrationProgress('org-123', migrationId);
   * if (progress) {
   *   console.log(`${progress.succeeded}/${progress.total} complete`);
   * }
   * ```
   */
  getMigrationProgress(
    organizationId: string,
    migrationId: string
  ): IMigrationProgress | undefined {
    const metadata = this.activeMigrations.get(migrationId);
    // Enforce organization scoping for multi-tenancy isolation
    if (metadata && metadata.progress.organizationId === organizationId) {
      return { ...metadata.progress };
    }
    return undefined;
  }

  /**
   * Pauses an in-progress migration.
   *
   * The migration will complete its current batch before pausing.
   * Use {@link resumeMigration} to continue processing.
   *
   * **Multi-tenancy**: The organizationId parameter enforces tenant isolation.
   * Returns false if the migration belongs to a different organization.
   *
   * @param organizationId - The organization ID for tenant isolation
   * @param migrationId - The unique migration identifier
   * @returns true if migration was paused, false if not found, not in progress, or belongs to another org
   *
   * @example
   * ```typescript
   * // Pause during off-peak hours
   * if (isOffPeakHours()) {
   *   migrationService.pauseMigration('org-123', migrationId);
   * }
   * ```
   */
  pauseMigration(organizationId: string, migrationId: string): boolean {
    const metadata = this.activeMigrations.get(migrationId);
    // Enforce organization scoping for multi-tenancy isolation
    if (
      metadata &&
      metadata.progress.organizationId === organizationId &&
      metadata.progress.state === MigrationState.IN_PROGRESS
    ) {
      metadata.progress.state = MigrationState.PAUSED;
      return true;
    }
    return false;
  }

  /**
   * Resumes a paused migration.
   *
   * Processing continues from where it was paused. Already-processed
   * entities are skipped using the stored processedIds set.
   *
   * **Multi-tenancy**: The organizationId parameter enforces tenant isolation.
   * Returns false if the migration belongs to a different organization.
   *
   * @param organizationId - The organization ID for tenant isolation
   * @param migrationId - The unique migration identifier
   * @returns true if migration was resumed, false if not found, not paused, or belongs to another org
   *
   * @example
   * ```typescript
   * // Resume during maintenance window
   * if (migrationService.resumeMigration('org-123', migrationId)) {
   *   console.log('Migration resumed');
   * }
   * ```
   */
  resumeMigration(organizationId: string, migrationId: string): boolean {
    const metadata = this.activeMigrations.get(migrationId);
    // Enforce organization scoping for multi-tenancy isolation
    if (
      metadata &&
      metadata.progress.organizationId === organizationId &&
      metadata.progress.state === MigrationState.PAUSED
    ) {
      metadata.progress.state = MigrationState.IN_PROGRESS;
      return true;
    }
    return false;
  }

  /**
   * Cancels an active migration.
   *
   * The migration is immediately marked as FAILED and removed from
   * active tracking. Already-processed entities remain migrated.
   *
   * **Warning**: Cancellation leaves data in a partially migrated state.
   * You may need to run another migration to complete the process or
   * roll back already-migrated entities.
   *
   * **Multi-tenancy**: The organizationId parameter enforces tenant isolation.
   * Returns false if the migration belongs to a different organization.
   *
   * @param organizationId - The organization ID for tenant isolation
   * @param migrationId - The unique migration identifier
   * @returns true if migration was cancelled, false if not found or belongs to another org
   */
  cancelMigration(organizationId: string, migrationId: string): boolean {
    const metadata = this.activeMigrations.get(migrationId);
    // Enforce organization scoping for multi-tenancy isolation
    if (metadata && metadata.progress.organizationId === organizationId) {
      metadata.progress.state = MigrationState.FAILED;
      this.activeMigrations.delete(migrationId);
      return true;
    }
    return false;
  }

  /**
   * Lists all currently active migrations for an organization.
   *
   * Returns progress snapshots for all migrations that are PENDING,
   * IN_PROGRESS, or PAUSED. Completed and failed migrations are not included.
   *
   * **Multi-tenancy**: The organizationId parameter enforces tenant isolation.
   * Only returns migrations belonging to the specified organization.
   *
   * @param organizationId - The organization ID for tenant isolation
   * @returns Array of migration progress objects for the organization
   *
   * @example
   * ```typescript
   * const active = migrationService.listActiveMigrations('org-123');
   * console.log(`${active.length} migrations in progress`);
   * active.forEach(m => {
   *   console.log(`  ${m.migrationId}: ${m.state} (${m.processed}/${m.total})`);
   * });
   * ```
   */
  listActiveMigrations(organizationId: string): IMigrationProgress[] {
    // Active states are PENDING, IN_PROGRESS, and PAUSED (excludes COMPLETED/FAILED)
    const activeStates = new Set([
      MigrationState.PENDING,
      MigrationState.IN_PROGRESS,
      MigrationState.PAUSED
    ]);

    return Array.from(this.activeMigrations.values())
      .filter(
        (m) => m.progress.organizationId === organizationId && activeStates.has(m.progress.state)
      )
      .map((m) => ({ ...m.progress }));
  }

  /**
   * Previews a migration without modifying any data.
   *
   * This convenience method runs the full migration workflow with dryRun=true,
   * allowing you to:
   * - Verify provider connectivity and permissions
   * - Estimate migration duration
   * - Identify potential failures before production run
   * - Test progress callbacks and error handling
   *
   * **Security Note**: Always run a preview in staging before production migrations.
   *
   * @typeParam T - Entity type being migrated
   * @param repository - Repository adapter for entity access
   * @param options - Migration options (dryRun will be forced to true)
   * @returns Migration result showing what would have happened
   *
   * @example
   * ```typescript
   * const preview = await migrationService.previewMigration(userRepository, {
   *   organizationId: 'org-123',
   *   oldKeyId: 'alias/key-2024',
   *   newKeyId: 'alias/key-2025'
   * });
   *
   * console.log(`Preview complete:`);
   * console.log(`  Would migrate: ${preview.total} entities`);
   * console.log(`  Estimated time: ${preview.duration}ms`);
   * console.log(`  Potential failures: ${preview.failed}`);
   *
   * if (preview.failed === 0) {
   *   console.log('Safe to proceed with actual migration');
   * }
   * ```
   */
  async previewMigration<T extends Record<string, unknown>>(
    repository: IEntityRepository<T>,
    options: IDataMigrationOptions
  ): Promise<IDataMigrationResult> {
    return this.migrateEntities(repository, {
      ...options,
      dryRun: true
    });
  }

  /**
   * Removes stale migrations from the active migrations map.
   *
   * This method prevents unbounded memory growth by evicting migration metadata
   * that has been inactive for longer than the specified TTL. Only migrations
   * in terminal states (FAILED) or that have exceeded the TTL are removed.
   * Active migrations (PENDING, IN_PROGRESS, PAUSED) are never removed
   * regardless of age.
   *
   * **Multi-tenancy**: The organizationId parameter enforces tenant isolation.
   * Only removes migrations belonging to the specified organization.
   *
   * @param organizationId - The organization ID for tenant isolation
   * @param ttlMs - Time-to-live in milliseconds. Migrations with `updatedAt`
   *                older than `now - ttlMs` will be removed. Must be positive.
   * @returns Number of migrations that were evicted
   *
   * @example
   * ```typescript
   * // Clean up migrations older than 1 hour for a specific organization
   * const evicted = migrationService.clearStaleMigrations('org-123', 60 * 60 * 1000);
   * console.log(`Evicted ${evicted} stale migrations`);
   *
   * // Periodic cleanup (call from a scheduled task)
   * setInterval(() => {
   *   migrationService.clearStaleMigrations('org-123', 24 * 60 * 60 * 1000); // 24 hours
   * }, 60 * 60 * 1000); // Run every hour
   * ```
   */
  clearStaleMigrations(organizationId: string, ttlMs: number): number {
    if (ttlMs <= 0) {
      return 0;
    }

    const now = Date.now();
    const cutoffTime = now - ttlMs;
    let evictedCount = 0;

    // Only evict FAILED migrations that are older than TTL
    // Active states (PENDING, IN_PROGRESS, PAUSED) are never evicted
    const terminalStates = new Set([MigrationState.FAILED]);

    for (const [migrationId, metadata] of this.activeMigrations.entries()) {
      // Enforce organization scoping for multi-tenancy isolation
      if (metadata.progress.organizationId !== organizationId) {
        continue;
      }

      const isTerminal = terminalStates.has(metadata.progress.state);
      const isStale = metadata.updatedAt.getTime() < cutoffTime;

      if (isTerminal && isStale) {
        this.activeMigrations.delete(migrationId);
        evictedCount++;
      }
    }

    return evictedCount;
  }
}

/**
 * Factory function to create a DataMigrationService instance.
 *
 * @param providerGetter - Function to retrieve KMS providers by name
 * @param defaultProviderName - Name of the default provider to use
 * @returns A configured DataMigrationService instance
 *
 * @example
 * ```typescript
 * const migrationService = createDataMigrationService(
 *   (name) => kmsProviders.get(name ?? 'default'),
 *   'aws-kms'
 * );
 * ```
 */
export function createDataMigrationService(
  providerGetter: (name?: string) => IKmsProvider | undefined,
  defaultProviderName?: string
): DataMigrationService {
  return new DataMigrationService(providerGetter, defaultProviderName);
}
