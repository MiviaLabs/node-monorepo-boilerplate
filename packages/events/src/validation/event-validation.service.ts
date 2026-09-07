/**
 * Event validation service
 *
 * Provides runtime schema validation for events using Zod.
 * Ensures event payloads match their declared schemas at runtime,
 * catching data inconsistencies early in the event pipeline.
 *
 * @module validation/event-validation-service
 */

import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import type { EventMessage } from '../event-bus';

/**
 * Event schema definition
 *
 * Defines the validation schema for a specific event type and version.
 *
 * @template T - The type of event payload after validation
 */
export interface EventSchemaDefinition<T = unknown> {
  /** Event type (e.g., 'user.created') */
  readonly eventType: string;
  /** Schema version (e.g., '1.0') */
  readonly version: string;
  /** Zod schema for validation */
  readonly schema: z.ZodSchema<T>;
}

/**
 * Validation result
 *
 * Contains the result of schema validation with detailed error information.
 */
export interface ValidationResult {
  /** Whether validation passed */
  readonly valid: boolean;
  /** Validation errors (if invalid) */
  readonly errors?: ReadonlyArray<{
    readonly path: string;
    readonly message: string;
  }>;
}

/**
 * Event validation service
 *
 * Validates event payloads against registered Zod schemas.
 * Provides both strict validation (throws on error) and
 * gentle validation (returns result) modes.
 *
 * @example
 * ```typescript
 * // Register schema
 * validationService.registerSchema({
 *   eventType: 'user.created',
 *   version: '1.0',
 *   schema: z.object({
 *     userId: z.string().uuid(),
 *     email: z.string().email(),
 *   }),
 * });
 *
 * // Validate event
 * const result = validationService.validate(eventMessage);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 *
 * // Validate or throw
 * try {
 *   validationService.validateOrThrow(eventMessage);
 *   // Event is valid
 * } catch (error) {
 *   // Handle validation error
 * }
 * ```
 */
@Injectable()
export class EventValidationService {
  private readonly logger: Logger;
  private readonly schemas = new Map<string, Map<string, z.ZodSchema>>();
  private readonly enabled: boolean;

  /**
   * Create event validation service
   *
   * @param enabled - Whether validation is enabled (default: true)
   */
  constructor(enabled = true) {
    this.logger = new Logger(EventValidationService.name);
    this.enabled = enabled;
  }

  /**
   * Check if validation is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Register an event schema
   *
   * Schemas are stored by event type and version for granular validation.
   *
   * @param definition - Schema definition
   *
   * @example
   * ```typescript
   * validationService.registerSchema({
   *   eventType: 'user.created',
   *   version: '1.0',
   *   schema: z.object({
   *     userId: z.string().uuid(),
   *     email: z.string().email(),
   *     name: z.string().min(1),
   *   }),
   * });
   * ```
   */
  registerSchema<T>(definition: EventSchemaDefinition<T>): void {
    let versionMap = this.schemas.get(definition.eventType);
    if (!versionMap) {
      versionMap = new Map();
      this.schemas.set(definition.eventType, versionMap);
    }
    versionMap.set(definition.version, definition.schema);
    this.logger.log(`Registered schema for ${definition.eventType}@${definition.version}`);
  }

  /**
   * Register multiple schemas at once
   *
   * @param definitions - Array of schema definitions
   */
  registerSchemas<T>(definitions: ReadonlyArray<EventSchemaDefinition<T>>): void {
    for (const definition of definitions) {
      this.registerSchema(definition);
    }
  }

  /**
   * Validate an event message
   *
   * Returns a validation result without throwing.
   * Use this when you want to handle validation errors gracefully.
   *
   * @param event - Event message to validate
   * @returns Validation result
   *
   * @example
   * ```typescript
   * const result = validationService.validate(eventMessage);
   * if (!result.valid) {
   *   for (const error of result.errors ?? []) {
   *     console.error(`${error.path}: ${error.message}`);
   *   }
   * }
   * ```
   */
  validate(event: EventMessage): ValidationResult {
    // If validation is disabled, always pass
    if (!this.enabled) {
      return { valid: true };
    }

    const versionMap = this.schemas.get(event.eventType);
    if (!versionMap) {
      // No schema registered for this event type
      // This is acceptable for new/unregistered events
      this.logger.debug(`No schema registered for event type: ${event.eventType}`);
      return { valid: true };
    }

    const schema = versionMap.get(event.schemaVersion);
    if (!schema) {
      // No schema registered for this version
      // This is acceptable - event may be from a newer version
      this.logger.debug(`No schema registered for ${event.eventType}@${event.schemaVersion}`);
      return { valid: true };
    }

    const result = schema.safeParse(event.data);
    if (!result.success) {
      return {
        valid: false,
        errors: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message
        }))
      };
    }

    return { valid: true };
  }

  /**
   * Validate an event or throw
   *
   * Throws an error if validation fails.
   * Use this when validation failures should stop processing.
   *
   * @param event - Event message to validate
   * @throws {Error} If validation fails
   *
   * @example
   * ```typescript
   * try {
   *   validationService.validateOrThrow(eventMessage);
   *   // Process event
   * } catch (error) {
   *   // Handle validation error
   *   this.logger.error('Event validation failed', error);
   * }
   * ```
   */
  validateOrThrow(event: EventMessage): void {
    const result = this.validate(event);
    if (!result.valid) {
      const errorMessages =
        result.errors?.map((e) => `  - ${e.path}: ${e.message}`).join('\n') ?? 'Unknown error';
      throw new Error(
        `Event validation failed for ${event.eventType}@${event.schemaVersion}:\n${errorMessages}`
      );
    }
  }

  /**
   * Check if a schema is registered
   *
   * @param eventType - Event type
   * @param version - Schema version
   * @returns True if schema is registered
   */
  hasSchema(eventType: string, version: string): boolean {
    const versionMap = this.schemas.get(eventType);
    return versionMap?.has(version) ?? false;
  }

  /**
   * Get all registered event types
   *
   * @returns Array of event type names
   */
  getRegisteredEventTypes(): ReadonlyArray<string> {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get all versions for an event type
   *
   * @param eventType - Event type
   * @returns Array of version strings
   */
  getVersionsForEventType(eventType: string): ReadonlyArray<string> {
    const versionMap = this.schemas.get(eventType);
    return versionMap ? Array.from(versionMap.keys()) : [];
  }

  /**
   * Clear all registered schemas
   *
   * Useful for testing or schema refresh.
   */
  clearSchemas(): void {
    this.schemas.clear();
    this.logger.log('All schemas cleared');
  }
}
