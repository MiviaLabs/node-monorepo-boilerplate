/**
 * Event version compatibility validation
 *
 * This module provides functionality to validate compatibility between
 * event producer versions and consumer versions. It maintains a compatibility
 * matrix that defines which consumer versions can handle events from which
 * producer versions.
 *
 * @module versioning/version-validation
 */

import type { CompatibilityResult } from './event-versioning.types';

/**
 * Compatibility matrix type
 *
 * Maps event types to their version compatibility rules.
 * For each event type, defines which consumer versions are compatible
 * with each producer version.
 *
 * @example
 * ```typescript
 * const matrix: CompatibilityMatrix = {
 *   'user.created': {
 *     '1.0': ['1.0'],           // Only 1.0 consumers can handle 1.0 events
 *     '1.1': ['1.0', '1.1'],    // 1.0 consumers can handle 1.1 (backward compatible)
 *     '2.0': ['2.0'],           // Breaking change - only 2.0 consumers
 *   },
 * };
 * ```
 */
export interface CompatibilityMatrix {
  readonly [eventType: string]: {
    readonly [producerVersion: string]: readonly string[];
  };
}

/**
 * Default compatibility matrix for common event types
 *
 * This matrix defines version compatibility rules following semantic versioning:
 * - Minor version updates are backward compatible (1.0 consumers can handle 1.1 events)
 * - Major version updates are breaking changes (1.0 consumers cannot handle 2.0 events)
 *
 * Add new event types to this matrix as needed.
 *
 * @example
 * ```typescript
 * // Add new event type
 * DEFAULT_COMPATIBILITY_MATRIX['order.placed'] = {
 *   '1.0': ['1.0'],
 *   '1.1': ['1.0', '1.1'],
 * };
 * ```
 */
export const DEFAULT_COMPATIBILITY_MATRIX: CompatibilityMatrix = {
  // User events
  'user.created': {
    '1.0': ['1.0'],
    '1.1': ['1.0', '1.1'], // Consumer 1.0 can handle 1.1 (backward compatible)
    '2.0': ['2.0'] // Breaking change - consumer 1.0 cannot handle 2.0
  },
  'user.registered': {
    '1.0': ['1.0'],
    '1.1': ['1.0', '1.1']
  },
  'user.loggedin': {
    '1.0': ['1.0']
  },
  'user.updated': {
    '1.0': ['1.0'],
    '1.1': ['1.0', '1.1']
  },
  'user.deleted': {
    '1.0': ['1.0']
  },

  // Organization events
  'organization.created': {
    '1.0': ['1.0'],
    '1.1': ['1.0', '1.1']
  },
  'organization.updated': {
    '1.0': ['1.0']
  },
  'organization.deleted': {
    '1.0': ['1.0']
  },

  // System events
  'system.started': {
    '1.0': ['1.0']
  },
  'system.shutdown': {
    '1.0': ['1.0']
  }
};

/**
 * Version compatibility checker
 *
 * Validates compatibility between event producer and consumer versions.
 * Uses a compatibility matrix to determine which consumer versions can
 * handle events from which producer versions.
 *
 * @example
 * ```typescript
 * const checker = new VersionCompatibilityChecker();
 *
 * // Check if specific versions are compatible
 * const isCompatible = checker.isCompatible('user.created', '1.1', '1.0');
 *
 * // Validate consumer against producer version
 * const result = checker.validateConsumer('user.created', ['1.0'], '1.1');
 *
 * // Get all compatible consumer versions
 * const versions = checker.getCompatibleVersions('user.created', '1.1');
 * ```
 */
export class VersionCompatibilityChecker {
  /**
   * Creates a new version compatibility checker
   *
   * @param matrix - Compatibility matrix to use (defaults to DEFAULT_COMPATIBILITY_MATRIX)
   */
  constructor(private readonly matrix: CompatibilityMatrix = DEFAULT_COMPATIBILITY_MATRIX) {}

  /**
   * Check if a specific consumer version is compatible with a producer version
   *
   * @param eventType - The event type to check
   * @param producerVersion - The producer's event version
   * @param consumerVersion - The consumer's supported version
   * @returns true if the consumer can handle events from this producer version
   *
   * @example
   * ```typescript
   * const checker = new VersionCompatibilityChecker();
   * const canHandle = checker.isCompatible('user.created', '1.1', '1.0');
   * // Returns: true (1.0 consumers can handle 1.1 events)
   * ```
   */
  isCompatible(eventType: string, producerVersion: string, consumerVersion: string): boolean {
    const compatibleVersions = this.matrix[eventType]?.[producerVersion];
    return compatibleVersions?.includes(consumerVersion) ?? false;
  }

  /**
   * Validate if any of the consumer's versions are compatible with the producer version
   *
   * This is useful when a consumer declares multiple supported versions.
   *
   * @param eventType - The event type to check
   * @param consumerVersions - Array of versions the consumer supports
   * @param producerVersion - The producer's event version
   * @returns Compatibility result with reason if incompatible
   *
   * @example
   * ```typescript
   * const checker = new VersionCompatibilityChecker();
   * const result = checker.validateConsumer('user.created', ['1.0', '1.1'], '1.1');
   * // Returns: { compatible: true }
   *
   * const result2 = checker.validateConsumer('user.created', ['1.0'], '2.0');
   * // Returns: { compatible: false, reason: 'Consumer version 1.0 not compatible...', ... }
   * ```
   */
  validateConsumer(
    eventType: string,
    consumerVersions: readonly string[],
    producerVersion: string
  ): CompatibilityResult {
    // Direct match is always compatible
    if (consumerVersions.includes(producerVersion)) {
      return { compatible: true };
    }

    const compatibleVersions = this.matrix[eventType]?.[producerVersion];

    // Unknown event type
    if (!compatibleVersions) {
      return {
        compatible: false,
        reason: 'Unknown event type: ' + eventType,
        suggestion: 'Add ' + eventType + ' to the compatibility matrix'
      };
    }

    // Unknown producer version for this event type
    if (this.matrix[eventType] && !this.matrix[eventType][producerVersion]) {
      return {
        compatible: false,
        reason: 'Unknown producer version: ' + producerVersion + ' for event type: ' + eventType,
        suggestion: 'Add producer version ' + producerVersion + ' to the compatibility matrix'
      };
    }

    // Check if any consumer version is compatible
    const hasCompatibleVersion = consumerVersions.some((v) => compatibleVersions.includes(v));

    if (!hasCompatibleVersion) {
      return {
        compatible: false,
        reason:
          'Consumer version(s) ' +
          consumerVersions.join(', ') +
          ' not compatible with producer version ' +
          producerVersion,
        suggestion: 'Upgrade consumer to one of: ' + compatibleVersions.join(', ')
      };
    }

    return { compatible: true };
  }

  /**
   * Get all consumer versions compatible with a producer version
   *
   * @param eventType - The event type
   * @param producerVersion - The producer's event version
   * @returns Array of compatible consumer versions (empty if none found)
   *
   * @example
   * ```typescript
   * const checker = new VersionCompatibilityChecker();
   * const versions = checker.getCompatibleVersions('user.created', '1.1');
   * // Returns: ['1.0', '1.1']
   * ```
   */
  getCompatibleVersions(eventType: string, producerVersion: string): string[] {
    return [...(this.matrix[eventType]?.[producerVersion] ?? [])];
  }

  /**
   * Get the compatibility matrix
   *
   * @returns The compatibility matrix being used
   */
  getMatrix(): Readonly<CompatibilityMatrix> {
    return this.matrix;
  }
}
