/**
 * Seed package exports
 *
 * Main entry point for seed functionality.
 */

// Seed runner and security functions
export {
  SeedRunner,
  redactDatabaseUrl,
  validateDatabaseUrl,
  checkProductionSafety
} from './seed-runner';

// Interfaces
export type { SeedConfig, SeedResult } from './interfaces/seed-config.interface';
export type { SeedDataset } from './interfaces/seed-dataset.interface';

// Factories
export * from './factories';

// Datasets
export { developmentDataset, testingDataset } from './datasets';
