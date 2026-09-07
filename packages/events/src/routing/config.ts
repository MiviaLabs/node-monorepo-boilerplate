/**
 * Event routing configuration loader
 *
 * Provides flexible configuration loading from multiple sources:
 * 1. Code-based configuration (highest priority)
 * 2. Environment variable (JSON string)
 * 3. Configuration file (JSON)
 * 4. Default values (lowest priority)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { logger } from '../logging/logger';

import type { EventRoutingConfig, ResolvedEventRoutingConfig } from './interfaces';
import { RoutingStrategy, FailurePolicy, DestinationType } from './interfaces';

// Re-export types for convenience
export type { EventRoutingConfig, ResolvedEventRoutingConfig } from './interfaces';

/**
 * Environment variable names for routing configuration
 */
const ROUTING_ENABLED_VAR = 'EVENT_ROUTING_ENABLED';
const ROUTING_CONFIG_VAR = 'EVENT_ROUTING_CONFIG';
const ROUTING_CONFIG_PATH_VAR = 'EVENT_ROUTING_CONFIG_PATH';

/**
 * Default routing configuration
 */
const DEFAULT_ROUTING_CONFIG: ResolvedEventRoutingConfig = {
  enabled: false,
  defaultStrategy: RoutingStrategy.ALL,
  defaultFailurePolicy: FailurePolicy.CONTINUE,
  routes: [],
  parallel: true
};

/**
 * Parse JSON configuration from string
 *
 * @param jsonString - JSON string to parse
 * @returns Parsed configuration object or undefined if parsing fails
 */
function parseJsonConfig(jsonString: string): EventRoutingConfig | undefined {
  try {
    const config = JSON.parse(jsonString) as EventRoutingConfig;

    // Basic validation
    if (typeof config !== 'object' || config === null) {
      logger.warn('Invalid routing configuration: not an object');
      return undefined;
    }

    // Validate routes if present
    if (config.routes && !Array.isArray(config.routes)) {
      logger.warn('Invalid routing configuration: routes must be an array');
      return undefined;
    }

    return config;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to parse routing configuration JSON: ${errorMessage}`);
    return undefined;
  }
}

/**
 * Load routing configuration from file
 *
 * @param filePath - Path to JSON configuration file
 * @returns Parsed configuration object or undefined if file doesn't exist or is invalid
 */
function loadConfigFromFile(filePath: string): EventRoutingConfig | undefined {
  try {
    const absolutePath = resolve(filePath);
    const fileContent = readFileSync(absolutePath, 'utf-8');
    return parseJsonConfig(fileContent);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to load routing configuration from file: ${errorMessage}`);
    return undefined;
  }
}

/**
 * Load routing configuration from environment variables
 *
 * Checks for:
 * 1. EVENT_ROUTING_ENABLED - Boolean flag to enable/disable routing
 * 2. EVENT_ROUTING_CONFIG - JSON string with routing configuration
 * 3. EVENT_ROUTING_CONFIG_PATH - Path to JSON configuration file
 *
 * @returns Configuration from environment variables or undefined if not configured
 */
function loadConfigFromEnv(): EventRoutingConfig | undefined {
  // Check if routing is explicitly enabled/disabled
  const routingEnabled = process.env[ROUTING_ENABLED_VAR];
  if (routingEnabled === 'false' || routingEnabled === '0') {
    logger.info('Event routing explicitly disabled via environment variable');
    return { enabled: false };
  }

  // Try JSON config from environment variable first (highest priority)
  const configJson = process.env[ROUTING_CONFIG_VAR];
  if (configJson) {
    logger.info('Loading routing configuration from EVENT_ROUTING_CONFIG environment variable');
    const config = parseJsonConfig(configJson);
    if (config) {
      return config;
    }
  }

  // Try config file path next
  const configPath = process.env[ROUTING_CONFIG_PATH_VAR];
  if (configPath) {
    logger.info(`Loading routing configuration from file: ${configPath}`);
    const config = loadConfigFromFile(configPath);
    if (config) {
      return config;
    }
  }

  // If routing is explicitly enabled but no config provided, enable with defaults
  if (routingEnabled === 'true' || routingEnabled === '1') {
    logger.info('Event routing explicitly enabled via environment variable (using defaults)');
    return { enabled: true };
  }

  return undefined;
}

/**
 * Resolve routing configuration with defaults applied
 *
 * Configuration priority (highest to lowest):
 * 1. Code-based configuration (input parameter)
 * 2. Environment variable (EVENT_ROUTING_CONFIG or EVENT_ROUTING_CONFIG_PATH)
 * 3. Default values
 *
 * @param config - Optional configuration from code
 * @returns Resolved configuration with all defaults applied
 */
export function resolveRoutingConfig(config?: EventRoutingConfig): ResolvedEventRoutingConfig {
  // Start with defaults
  const resolved: ResolvedEventRoutingConfig = { ...DEFAULT_ROUTING_CONFIG };

  // Load configuration from environment if no code-based config provided
  const envConfig = config === undefined ? loadConfigFromEnv() : undefined;
  const sourceConfig = config ?? envConfig;

  if (!sourceConfig) {
    logger.info('No routing configuration provided, using defaults (routing disabled)');
    return resolved;
  }

  // Apply configuration values
  if (sourceConfig.enabled !== undefined) {
    resolved.enabled = sourceConfig.enabled;
  }

  if (sourceConfig.defaultStrategy !== undefined) {
    resolved.defaultStrategy = sourceConfig.defaultStrategy;
  }

  if (sourceConfig.defaultFailurePolicy !== undefined) {
    resolved.defaultFailurePolicy = sourceConfig.defaultFailurePolicy;
  }

  if (sourceConfig.parallel !== undefined) {
    resolved.parallel = sourceConfig.parallel;
  }

  if (sourceConfig.routes) {
    // Validate and apply routes
    resolved.routes = sourceConfig.routes.filter((route) => {
      if (!route.eventType || typeof route.eventType !== 'string') {
        logger.warn('Invalid route: missing or invalid eventType');
        return false;
      }

      if (
        !route.destinations ||
        !Array.isArray(route.destinations) ||
        route.destinations.length === 0
      ) {
        logger.warn(
          `Invalid route for eventType '${route.eventType}': missing or invalid destinations`
        );
        return false;
      }

      // Validate each destination
      const validDestinations = route.destinations.filter((dest) => {
        if (!dest.type || typeof dest.type !== 'string') {
          logger.warn(
            `Invalid destination for eventType '${route.eventType}': missing or invalid type`
          );
          return false;
        }

        const validTypes = [DestinationType.KAFKA, DestinationType.PUBSUB, DestinationType.QUEUE];
        if (!validTypes.includes(dest.type as DestinationType)) {
          logger.warn(`Invalid destination type '${dest.type}' for eventType '${route.eventType}'`);
          return false;
        }

        return true;
      });

      if (validDestinations.length === 0) {
        logger.warn(`No valid destinations for eventType '${route.eventType}'`);
        return false;
      }

      // Update route with validated destinations
      route.destinations = validDestinations;

      return true;
    });
  }

  if (resolved.enabled && resolved.routes.length === 0) {
    logger.warn(
      'Event routing is enabled but no valid routes configured. Routing will have no effect.'
    );
  }

  logger.info('Event routing configuration resolved', {
    enabled: resolved.enabled,
    routesCount: resolved.routes.length,
    defaultStrategy: resolved.defaultStrategy,
    defaultFailurePolicy: resolved.defaultFailurePolicy,
    parallel: resolved.parallel
  });

  return resolved;
}

/**
 * Parse simplified routing configuration from environment variable
 *
 * Simplified format for environment variable configuration:
 * {"user.created":["kafka","pubsub"],"order.completed":["queue"]}
 *
 * This is a convenience helper for the most common use case.
 *
 * @param jsonString - JSON string mapping event types to destination arrays
 * @returns Full EventRoutingConfig object with enabled flag and routes
 * @throws Error if JSON is invalid or destination types are unsupported
 */
export function parseSimpleRoutingConfig(jsonString: string): EventRoutingConfig {
  const simpleConfig = parseJsonConfig(jsonString);
  if (!simpleConfig) {
    throw new Error('Invalid routing configuration JSON');
  }

  // Convert simple format {eventType: [destinations]} to full format
  const routes = Object.entries(simpleConfig).map(([eventType, destinations]) => {
    if (!Array.isArray(destinations)) {
      throw new Error(`Invalid destinations for event type '${eventType}': expected array`);
    }

    return {
      eventType,
      destinations: destinations.map((type) => {
        if (typeof type !== 'string') {
          throw new Error(
            `Invalid destination type for event type '${eventType}': expected string`
          );
        }

        const validTypes = [DestinationType.KAFKA, DestinationType.PUBSUB, DestinationType.QUEUE];
        if (!validTypes.includes(type as DestinationType)) {
          throw new Error(`Invalid destination type '${type}' for event type '${eventType}'`);
        }

        return { type: type as DestinationType };
      })
    };
  });

  return {
    enabled: true,
    routes
  };
}

/**
 * Create routing configuration helper for code-based configuration
 *
 * @param config - Event routing configuration object
 * @returns The same configuration object (identity function for type checking)
 *
 * @example
 * ```typescript
 * const routingConfig = createRoutingConfig({
 *   enabled: true,
 *   defaultStrategy: 'all',
 *   routes: [
 *     {
 *       eventType: 'user.created',
 *       destinations: [
 *         { type: 'kafka' },
 *         { type: 'pubsub' },
 *       ],
 *     },
 *   ],
 * });
 * ```
 */
export function createRoutingConfig(config: EventRoutingConfig): EventRoutingConfig {
  return config;
}
