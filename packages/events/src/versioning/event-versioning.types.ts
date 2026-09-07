/**
 * Event versioning types
 *
 * This module defines types for event schema versioning and compatibility management.
 * Event versioning enables consumers to handle different schema versions of events,
 * supporting backward compatibility and graceful schema evolution.
 *
 * @module versioning/event-versioning-types
 */

/**
 * Event version string format
 *
 * Versions follow semantic versioning format: 'major.minor'
 * - major: Breaking changes (incompatible with previous versions)
 * - minor: Backward-compatible additions
 *
 * @example '1.0', '1.1', '2.0'
 */
export type EventVersion = `${number}.${number}`;

/**
 * Versioned event metadata
 *
 * Attached to events to indicate their schema version.
 *
 * @example
 * ```typescript
 * const metadata: EventVersionMetadata = {
 *   schemaVersion: '1.0',
 *   producerVersion: '1.1',
 * };
 * ```
 */
export interface EventVersionMetadata {
  /** The schema version of this event */
  readonly schemaVersion: EventVersion;

  /** The version of the service that produced this event */
  readonly producerVersion?: EventVersion;
}

/**
 * Consumer version compatibility declaration
 *
 * Consumers declare which event versions they can handle.
 *
 * @example
 * ```typescript
 * const consumer: ConsumerVersionDeclaration = {
 *   eventType: 'user.created',
 *   versions: ['1.0', '1.1'], // Can handle both versions
 *   minVersion: '1.0',
 *   maxVersion: '1.1',
 * };
 * ```
 */
export interface ConsumerVersionDeclaration {
  /** The event type this consumer handles */
  readonly eventType: string;

  /** List of versions this consumer can handle */
  readonly versions: readonly EventVersion[];

  /** Minimum version this consumer can handle */
  readonly minVersion: EventVersion;

  /** Maximum version this consumer can handle */
  readonly maxVersion: EventVersion;
}

/**
 * Compatibility check result
 *
 * Result of checking if a consumer can handle an event version.
 */
export interface CompatibilityResult {
  /** Whether the consumer is compatible with the event version */
  readonly compatible: boolean;

  /** Reason for incompatibility (if incompatible) */
  readonly reason?: string;

  /** Suggested action (if incompatible) */
  readonly suggestion?: string;
}

/**
 * Version compatibility entry
 *
 * Maps a producer version to compatible consumer versions.
 */
export interface VersionCompatibilityEntry {
  /** Producer version */
  readonly producerVersion: EventVersion;

  /** Consumer versions that can handle events from this producer version */
  readonly compatibleConsumerVersions: readonly EventVersion[];
}

/**
 * Event type compatibility mapping
 *
 * Maps versions and their compatibilities for a specific event type.
 */
export interface EventTypeCompatibility {
  /** Event type name */
  readonly eventType: string;

  /** Version compatibility entries */
  readonly versions: readonly VersionCompatibilityEntry[];
}

/**
 * Versioned event schema definition
 *
 * Defines the structure of an event at a specific version,
 * including validation rules and metadata.
 *
 * @example
 * ```typescript
 * const userCreatedV1Schema: VersionedEventSchema<UserCreatedV1> = {
 *   version: '1.0',
 *   schema: z.object({
 *     userId: z.string(),
 *     email: z.string().email(),
 *     name: z.string(),
 *   }),
 *   deprecationDate: undefined,
 *   sunsetDate: undefined,
 * };
 * ```
 */
export interface VersionedEventSchema<T = unknown> {
  /** Schema version (e.g., '1.0', '2.0') */
  readonly version: EventVersion;
  /** Validation schema (Zod or similar) */
  readonly schema: {
    readonly parse: (data: unknown) => T;
    readonly safeParse: (data: unknown) => {
      readonly success: boolean;
      readonly data?: T;
      readonly error?: unknown;
    };
  };
  /** Optional deprecation date (when schema is deprecated but still supported) */
  readonly deprecationDate?: Date;
  /** Optional sunset date (when schema is no longer supported) */
  readonly sunsetDate?: Date;
}

/**
 * Event migration function
 *
 * Transforms event data from one schema version to another.
 * Used for backward compatibility (consuming old events with new code)
 * and forward compatibility (consuming new events with old code).
 *
 * @template TOld - Source event data type
 * @template TNew - Target event data type
 *
 * @example
 * ```typescript
 * const userCreatedV1ToV2: EventMigration<UserCreatedV1, UserCreatedV2> = {
 *   fromVersion: '1.0',
 *   toVersion: '2.0',
 *   migrate: (oldEvent) => ({
 *     ...oldEvent,
 *     profile: {
 *       firstName: oldEvent.name.split(' ')[0],
 *       lastName: oldEvent.name.split(' ').slice(1).join(' '),
 *     },
 *   }),
 * };
 * ```
 */
export interface EventMigration<TOld = unknown, TNew = unknown> {
  /** Source version */
  readonly fromVersion: EventVersion;
  /** Target version */
  readonly toVersion: EventVersion;
  /** Migration function that transforms data from TOld to TNew */
  readonly migrate: (data: TOld) => TNew;
}

/**
 * Version compatibility rule
 *
 * Defines which producer versions are compatible with a given consumer version.
 * Used to enable consumer-driven contracts and allow evolution without breaking existing consumers.
 *
 * @example
 * ```typescript
 * const userCreatedV2Compatibility: VersionCompatibilityRule = {
 *   consumerVersion: '2.0',
 *   compatibleProducerVersions: ['1.0', '2.0', '3.0'],
 *   migrationRequired: true,
 * };
 * ```
 */
export interface VersionCompatibilityRule {
  /** Consumer schema version */
  readonly consumerVersion: EventVersion;
  /** List of producer versions this consumer can handle */
  readonly compatibleProducerVersions: readonly EventVersion[];
  /** Whether migration is needed for non-exact version matches */
  readonly migrationRequired: boolean;
}
