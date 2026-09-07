/**
 * Generate build context metadata as the final step of documentation generation.
 *
 * This script captures git context (commit hash, branch name) and build timestamp,
 * writing the metadata to .agents/docs/reference/generated.json for documentation versioning.
 *
 * @example
 * ```bash
 * pnpm run docs:meta
 * ```
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUTPUT_FILE = '.agents/docs/reference/generated.json';

/**
 * Build context metadata captured during documentation generation.
 *
 * @property generatedAt - ISO 8601 timestamp of when documentation was generated
 * @property commit - Short git commit hash (SHA) or "unknown" if unavailable
 * @property branch - Git branch name or "unknown" if unavailable
 */
interface IBuildMetadata {
  generatedAt: string;
  commit: string;
  branch: string;
}

/**
 * Retrieves the current git commit hash.
 *
 * @returns Short commit hash or "unknown" if git is unavailable
 */
function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Retrieves the current git branch name.
 *
 * @returns Branch name or "unknown" if git is unavailable
 */
function getBranchName(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Main execution function.
 */
function main(): void {
  console.log('Generating documentation metadata...\n');

  const metadata: IBuildMetadata = {
    generatedAt: new Date().toISOString(),
    commit: getCommitHash(),
    branch: getBranchName()
  };

  console.log(`  Timestamp: ${metadata.generatedAt}`);
  console.log(`  Commit:    ${metadata.commit}`);
  console.log(`  Branch:    ${metadata.branch}`);

  try {
    // Ensure output directory exists
    mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

    // Write metadata file
    writeFileSync(OUTPUT_FILE, JSON.stringify(metadata, null, 2) + '\n');

    console.log(`\n✓ Metadata written to ${OUTPUT_FILE}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✗ Failed to write metadata: ${message}`);
    process.exit(1);
  }
}

main();
