/**
 * Event schema registry service
 *
 * Provides a catalog of all event schemas with metadata.
 * Used for documentation, discovery, and schema evolution tracking.
 *
 * @module schema/event-registry-service
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Event schema metadata
 *
 * Contains documentation and metadata for an event schema.
 */
export interface EventSchemaMetadata {
  /** Event type (e.g., 'user.created') */
  readonly eventType: string;
  /** Schema version (e.g., '1.0') */
  readonly version: string;
  /** Human-readable description */
  readonly description: string;
  /** Example payload */
  readonly example: unknown;
  /** Whether schema is deprecated */
  readonly deprecated: boolean;
  /** When schema was deprecated */
  readonly deprecationDate?: Date;
  /** Schema that supersedes this one */
  readonly supersededBy?: string;
  /** When schema was introduced */
  readonly introducedAt?: Date;
  /** Related event types */
  readonly relatedEvents?: ReadonlyArray<string>;
}

/**
 * Event schema registry service
 *
 * Maintains a catalog of all event schemas with documentation.
 * Provides query methods for schema discovery and metadata lookup.
 *
 * @example
 * ```typescript
 * // Register schema metadata
 * registryService.register({
 *   eventType: 'user.created',
 *   version: '1.0',
 *   description: 'Emitted when a new user account is created',
 *   example: { userId: '123', email: 'user@example.com' },
 *   deprecated: false,
 * });
 *
 * // Get latest version
 * const latest = registryService.getLatestVersion('user.created');
 *
 * // List all versions
 * const versions = registryService.listVersions('user.created');
 *
 * // Export entire registry
 * const catalog = registryService.exportRegistry();
 * ```
 */
@Injectable()
export class EventRegistryService {
  private readonly logger = new Logger(EventRegistryService.name);
  private readonly registry = new Map<string, EventSchemaMetadata[]>();

  /**
   * Register event schema metadata
   *
   * @param metadata - Schema metadata
   */
  register(metadata: EventSchemaMetadata): void {
    const versions = this.registry.get(metadata.eventType) ?? [];
    versions.push(metadata);
    this.registry.set(metadata.eventType, versions);
    this.logger.log(`Registered schema metadata for ${metadata.eventType}@${metadata.version}`);
  }

  /**
   * Register multiple schemas at once
   *
   * @param metadataArray - Array of schema metadata
   */
  registerMultiple(metadataArray: ReadonlyArray<EventSchemaMetadata>): void {
    for (const metadata of metadataArray) {
      this.register(metadata);
    }
  }

  /**
   * Get the latest version of an event type
   *
   * @param eventType - Event type
   * @returns Latest schema metadata, or undefined if not found
   */
  getLatestVersion(eventType: string): EventSchemaMetadata | undefined {
    const versions = this.registry.get(eventType);
    return versions?.[versions.length - 1];
  }

  /**
   * Get a specific version of an event type
   *
   * @param eventType - Event type
   * @param version - Schema version
   * @returns Schema metadata, or undefined if not found
   */
  getVersion(eventType: string, version: string): EventSchemaMetadata | undefined {
    const versions = this.registry.get(eventType);
    return versions?.find((v) => v.version === version);
  }

  /**
   * List all registered event types
   *
   * @returns Array of event type names
   */
  listEventTypes(): ReadonlyArray<string> {
    return Array.from(this.registry.keys());
  }

  /**
   * List all versions for an event type
   *
   * @param eventType - Event type
   * @returns Array of schema metadata for all versions
   */
  listVersions(eventType: string): ReadonlyArray<EventSchemaMetadata> {
    return this.registry.get(eventType) ?? [];
  }

  /**
   * Check if an event type is registered
   *
   * @param eventType - Event type
   * @returns True if registered
   */
  hasEventType(eventType: string): boolean {
    return this.registry.has(eventType);
  }

  /**
   * Get deprecated event types
   *
   * @returns Array of deprecated schema metadata
   */
  getDeprecatedSchemas(): ReadonlyArray<EventSchemaMetadata> {
    const deprecated: EventSchemaMetadata[] = [];
    for (const versions of this.registry.values()) {
      for (const metadata of versions) {
        if (metadata.deprecated) {
          deprecated.push(metadata);
        }
      }
    }
    return deprecated;
  }

  /**
   * Get related event types
   *
   * @param eventType - Event type
   * @returns Array of related event type names
   */
  getRelatedEvents(eventType: string): ReadonlyArray<string> {
    const metadata = this.getLatestVersion(eventType);
    return metadata?.relatedEvents ?? [];
  }

  /**
   * Export entire registry
   *
   * Returns all registered schemas as a plain object.
   * Useful for API endpoints and documentation generation.
   *
   * @returns Registry export
   */
  exportRegistry(): Readonly<Record<string, ReadonlyArray<EventSchemaMetadata>>> {
    const result: Record<string, ReadonlyArray<EventSchemaMetadata>> = {};
    for (const [eventType, versions] of this.registry.entries()) {
      result[eventType] = versions;
    }
    return result;
  }

  /**
   * Search schemas by description
   *
   * @param query - Search query
   * @returns Array of matching schema metadata
   */
  search(query: string): ReadonlyArray<EventSchemaMetadata> {
    const lowerQuery = query.toLowerCase();
    const results: EventSchemaMetadata[] = [];

    for (const [eventType, versions] of this.registry.entries()) {
      if (eventType.includes(lowerQuery)) {
        results.push(...versions);
        continue;
      }

      for (const metadata of versions) {
        if (metadata.description.toLowerCase().includes(lowerQuery)) {
          results.push(metadata);
        }
      }
    }

    return results;
  }

  /**
   * Clear all registered schemas
   *
   * Useful for testing.
   */
  clear(): void {
    this.registry.clear();
    this.logger.log('Registry cleared');
  }

  /**
   * Get registry statistics
   *
   * @returns Statistics about registered schemas
   */
  getStats(): {
    totalEventTypes: number;
    totalSchemas: number;
    deprecatedSchemas: number;
  } {
    let totalSchemas = 0;
    let deprecatedSchemas = 0;

    for (const versions of this.registry.values()) {
      totalSchemas += versions.length;
      for (const metadata of versions) {
        if (metadata.deprecated) {
          deprecatedSchemas++;
        }
      }
    }

    return {
      totalEventTypes: this.registry.size,
      totalSchemas,
      deprecatedSchemas
    };
  }
}
