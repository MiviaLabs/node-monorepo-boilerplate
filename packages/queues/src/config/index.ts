/**
 * Configuration module for queues package
 *
 * This module provides a flexible configuration system that:
 * - Allows overriding all config options via input options
 * - Falls back to environment variables
 * - Provides sensible defaults for all options
 * - Supports multiple queue providers (BullMQ, Cloud Tasks, Pub/Sub)
 */

export * from './interfaces';
export * from './defaults';
export * from './config-resolver';
export * from './provider-config';
export * from './provider-resolver';
