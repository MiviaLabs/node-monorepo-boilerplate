import { Injectable, Logger } from '@nestjs/common';

import type {
  EventVersion,
  EventMigration,
  VersionedEventSchema,
  VersionCompatibilityRule
} from './event-versioning.types';

/**
 * Event versioning service
 *
 * Provides event schema versioning capabilities including:
 * - Schema registration and version tracking
 * - Event migration between versions
 * - Compatibility rule management
 * - Version resolution and validation
 *
 * This service enables gradual evolution of event schemas while maintaining
 * backward and forward compatibility between producers and consumers.
 *
 * @example
 * ```typescript
 * // Register schemas
 * eventVersioningService.registerSchema('user.created', {
 *   version: '1.0',
 *   schema: userCreatedV1Schema,
 * });
 *
 * eventVersioningService.registerSchema('user.created', {
 *   version: '2.0',
 *   schema: userCreatedV2Schema,
 * });
 *
 * // Register migration
 * eventVersioningService.registerMigration('user.created', {
 *   fromVersion: '1.0',
 *   toVersion: '2.0',
 *   migrate: (oldEvent) => ({ ...oldEvent, profile: transformProfile(oldEvent) }),
 * });
 *
 * // Register compatibility rule
 * eventVersioningService.registerCompatibilityRule('user.created', {
 *   consumerVersion: '2.0',
 *   compatibleProducerVersions: ['1.0', '2.0'],
 *   migrationRequired: true,
 * });
 * ```
 */
@Injectable()
export class EventVersioningService {
  private readonly logger = new Logger(EventVersioningService.name);
  private readonly versionRegistry = new Map<string, VersionedEventSchema[]>();
  private readonly migrations = new Map<string, EventMigration[]>();
  private readonly compatibilityRules = new Map<string, VersionCompatibilityRule[]>();

  /**
   * Register an event schema for a specific version
   *
   * Schemas are stored in order of registration, enabling version
   * tracking and migration path resolution.
   *
   * @param eventType - The event type (e.g., 'user.created')
   * @param schema - The versioned schema definition
   *
   * @example
   * ```typescript
   * eventVersioningService.registerSchema('user.created', {
   *   version: '1.0',
   *   schema: z.object({
   *     userId: z.string(),
   *     email: z.string().email(),
   *   }),
   * });
   * ```
   */
  registerSchema<T = unknown>(eventType: string, schema: VersionedEventSchema<T>): void {
    const schemas = this.versionRegistry.get(eventType) ?? [];
    schemas.push(schema);
    this.versionRegistry.set(eventType, schemas);
    this.logger.log(`Registered schema for ${eventType}@${schema.version}`);
  }

  /**
   * Get the latest version of an event type
   *
   * Returns the highest version number registered for the given event type.
   *
   * @param eventType - The event type
   * @returns The latest version number, or null if no versions are registered
   *
   * @example
   * ```typescript
   * const latestVersion = eventVersioningService.getLatestVersion('user.created');
   * // Returns: '2.0' if versions 1.0 and 2.0 are registered
   * ```
   */
  getLatestVersion(eventType: string): EventVersion | null {
    const schemas = this.versionRegistry.get(eventType);
    return schemas?.[schemas.length - 1]?.version ?? null;
  }

  /**
   * Migrate an event from one version to another
   *
   * Applies a chain of migrations to transform event data from the
   * source version to the target version.
   *
   * @param eventType - The event type
   * @param event - The event data to migrate
   * @param fromVersion - The source version
   * @param toVersion - The target version
   * @returns The migrated event data, or null if migration path not found
   *
   * @example
   * ```typescript
   * const migratedEvent = eventVersioningService.migrateEvent(
   *   'user.created',
   *   oldEvent,
   *   '1.0',
   *   '2.0'
   * );
   * ```
   */
  migrateEvent<T = unknown>(
    eventType: string,
    event: T,
    fromVersion: EventVersion,
    toVersion: EventVersion
  ): T | null {
    const migrationChain = this.findMigrationChain(eventType, fromVersion, toVersion);
    if (!migrationChain) {
      this.logger.warn(
        `No migration path found from ${fromVersion} to ${toVersion} for ${eventType}`
      );
      return null;
    }

    let result = event;
    for (const migration of migrationChain) {
      result = migration.migrate(result) as T;
    }
    return result;
  }

  /**
   * Register a migration between two versions
   *
   * Migrations are used to transform event data when consumers
   * need to handle events from different schema versions.
   *
   * @param eventType - The event type
   * @param migration - The migration definition
   *
   * @example
   * ```typescript
   * eventVersioningService.registerMigration('user.created', {
   *   fromVersion: '1.0',
   *   toVersion: '2.0',
   *   migrate: (oldEvent) => ({
   *     ...oldEvent,
   *     profile: {
   *       firstName: oldEvent.name.split(' ')[0],
   *       lastName: oldEvent.name.split(' ').slice(1).join(' '),
   *     },
   *   }),
   * });
   * ```
   */
  registerMigration<TOld = unknown, TNew = unknown>(
    eventType: string,
    migration: EventMigration<TOld, TNew>
  ): void {
    const migrations = this.migrations.get(eventType) ?? [];
    migrations.push(migration as EventMigration<unknown, unknown>);
    this.migrations.set(eventType, migrations);
    this.logger.log(
      `Registered migration for ${eventType}: ${migration.fromVersion} -> ${migration.toVersion}`
    );
  }

  /**
   * Register a compatibility rule
   *
   * Compatibility rules define which producer versions a consumer can handle,
   * enabling consumer-driven contracts and graceful schema evolution.
   *
   * @param eventType - The event type
   * @param rule - The compatibility rule
   *
   * @example
   * ```typescript
   * eventVersioningService.registerCompatibilityRule('user.created', {
   *   consumerVersion: '2.0',
   *   compatibleProducerVersions: ['1.0', '2.0', '3.0'],
   *   migrationRequired: true,
   * });
   * ```
   */
  registerCompatibilityRule(eventType: string, rule: VersionCompatibilityRule): void {
    const rules = this.compatibilityRules.get(eventType) ?? [];
    rules.push(rule);
    this.compatibilityRules.set(eventType, rules);
    this.logger.log(`Registered compatibility rule for ${eventType}@${rule.consumerVersion}`);
  }

  /**
   * Get compatible producer versions for a consumer version
   *
   * Returns the list of producer versions that the specified consumer
   * version can handle, based on registered compatibility rules.
   *
   * @param eventType - The event type
   * @param consumerVersion - The consumer version
   * @returns Array of compatible producer versions
   *
   * @example
   * ```typescript
   * const compatibleVersions = eventVersioningService.getCompatibleVersions(
   *   'user.created',
   *   '2.0'
   * );
   * // Returns: ['1.0', '2.0', '3.0']
   * ```
   */
  getCompatibleVersions(eventType: string, consumerVersion: EventVersion): EventVersion[] {
    const rules = this.compatibilityRules.get(eventType);
    const rule = rules?.find((r) => r.consumerVersion === consumerVersion);
    return [...(rule?.compatibleProducerVersions ?? [])];
  }

  /**
   * Find the migration chain from one version to another
   *
   * Builds a sequential chain of migrations to transform data from
   * the source version to the target version.
   *
   * @param eventType - The event type
   * @param fromVersion - The source version
   * @param toVersion - The target version
   * @returns Array of migrations in execution order, or null if path not found
   *
   * @private
   */
  private findMigrationChain(
    eventType: string,
    fromVersion: EventVersion,
    toVersion: EventVersion
  ): EventMigration[] | null {
    const migrations = this.migrations.get(eventType) ?? [];

    // Build migration chain from fromVersion to toVersion
    const chain: EventMigration[] = [];
    let currentVersion = fromVersion;

    while (currentVersion !== toVersion) {
      const migration = migrations.find((m) => m.fromVersion === currentVersion);

      if (!migration) {
        this.logger.debug(`No migration found from ${currentVersion} for ${eventType}`);
        return null;
      }

      chain.push(migration);
      currentVersion = migration.toVersion;

      // Prevent infinite loops
      if (chain.length > 100) {
        this.logger.error(
          `Migration chain exceeded maximum length for ${eventType}: ${fromVersion} -> ${toVersion}`
        );
        return null;
      }
    }

    return chain;
  }
}
