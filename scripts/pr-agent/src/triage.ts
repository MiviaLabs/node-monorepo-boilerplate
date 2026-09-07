/**
 * PR Triage Module
 *
 * Classifies changed files into review shards and builds a diff line map
 * for determining whether findings can be posted as inline comments.
 *
 * @packageDocumentation
 */

import { execSync } from 'node:child_process';

import type { Octokit } from '@octokit/rest';

import type { IDiffMap, ITriageResult } from './types.js';

/**
 * File patterns to skip during review (non-logic files).
 */
const SKIP_PATTERNS = [
  /\.md$/,
  /\.json$/,
  /\.lock$/,
  /\.snap$/,
  /^\.vscode\//,
  /\.prettierrc/,
  /\.eslintrc/,
  /CLAUDE\.md$/,
  /AGENTS\.md$/
];

/**
 * Maps shard names to file path patterns they should review.
 */
const SHARD_PATTERNS: Record<string, RegExp[]> = {
  security: [/.*/],
  'api-architecture': [/^apps\/api\//],
  'api-quality': [/^apps\/api\//],
  'web-quality': [/^apps\/web\//],
  packages: [/^packages\//],
  infra: [/^\.github\//, /^infrastructure\//, /\.sh$/, /^scripts\//]
};

/**
 * Triages PR files — determines which shards to run and builds diff metadata.
 *
 * @param octokit - Authenticated GitHub client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns Triage result with file lists, shard assignments, and diff map
 */
export async function triageFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<ITriageResult> {
  const { data: prFiles } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 300
  });

  const allFiles = prFiles.map((f) => f.filename);
  const reviewable = allFiles.filter((f) => !SKIP_PATTERNS.some((p) => p.test(f)));

  console.log(`Files: ${allFiles.length} total, ${reviewable.length} reviewable`);

  const diffMap = buildDiffMap();

  let diff = '';
  try {
    diff = execSync('git diff origin/dev...HEAD', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    console.warn('Failed to get git diff, using empty diff:', (error as Error).message);
  }

  const activeShards = Object.entries(SHARD_PATTERNS)
    .filter(([, patterns]) => reviewable.some((file) => patterns.some((p) => p.test(file))))
    .map(([name]) => name);

  console.log(`Active shards: ${activeShards.join(', ')}`);

  return {
    files: reviewable,
    shards: activeShards,
    diffMap,
    diff
  };
}

/**
 * Gets the list of files matching a specific shard's patterns.
 *
 * @param files - All reviewable files
 * @param shard - Shard name to filter for
 * @returns Files relevant to the given shard
 */
export function getShardFiles(files: string[], shard: string): string[] {
  const patterns = SHARD_PATTERNS[shard];
  if (!patterns) return files;
  return files.filter((f) => patterns.some((p) => p.test(f)));
}

/**
 * Parses `git diff` output to build a map of file → changed line numbers.
 * Used to determine if a finding is in the PR diff (for inline comments).
 *
 * @returns Map of file paths to arrays of changed line numbers
 */
function buildDiffMap(): IDiffMap {
  let raw = '';
  try {
    raw = execSync('git diff origin/dev...HEAD', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });
  } catch {
    console.warn('Could not build diff map');
    return {};
  }

  const map: IDiffMap = {};
  let currentFile = '';
  let lineNum = 0;

  for (const line of raw.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      map[currentFile] = [];
    } else if (line.startsWith('@@ ')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) lineNum = parseInt(match[1], 10) - 1;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNum++;
      map[currentFile]?.push(lineNum);
    } else if (!line.startsWith('-')) {
      lineNum++;
    }
  }

  return map;
}
