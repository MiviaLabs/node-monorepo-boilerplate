/**
 * Seed dataset contract
 *
 * All seed datasets must implement this interface.
 */

import type { SeedConfig, SeedResult } from './seed-config.interface';

export interface SeedDataset {
  /** Dataset name */
  readonly name: string;
  /** Dataset description */
  readonly description: string;
  /** Priority (lower runs first) */
  readonly priority: number;
  /** Run the seed dataset */
  seed(config: SeedConfig): Promise<SeedResult>;
}

export type { SeedConfig, SeedResult };
