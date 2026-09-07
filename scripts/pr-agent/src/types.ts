/**
 * PR Agent Types
 *
 * Shared type definitions for the PR agent analysis system.
 *
 * @packageDocumentation
 */

/**
 * Severity levels for PR review findings.
 */
export type Severity = 'P0' | 'P1' | 'P2';

/**
 * Confidence level for a finding.
 * - high: Issue is unambiguous from the diff alone
 * - medium: Issue requires some inference from context
 * - low: Issue is speculative — should be filtered out
 */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * A single finding from a review shard.
 */
export interface IFinding {
  severity: Severity;
  category: string;
  title: string;
  file: string;
  line: number;
  in_diff: boolean;
  code_snippet?: string;
  suggestion?: string;
  issue: string;
  impact?: string;
  fix?: string;
  reviewer?: string;
  confidence?: Confidence;
}

/**
 * Result from a single shard analysis.
 */
export interface IShardResult {
  shard: string;
  findings: IFinding[];
}

/**
 * Prompt configuration for a review shard.
 */
export interface IShardPrompt {
  name: string;
  instructions: string;
  files: string[];
  diff: string;
}

/**
 * Maps file paths to arrays of line numbers present in the PR diff.
 */
export interface IDiffMap {
  [file: string]: number[];
}

/**
 * Result of the triage phase — classifying changed files into shards.
 */
export interface ITriageResult {
  files: string[];
  shards: string[];
  diffMap: IDiffMap;
  diff: string;
}

/**
 * Parameters for posting a PR review.
 */
export interface IReviewParams {
  prNumber: number;
  headSha: string;
  findings: IFinding[];
  diffMap: IDiffMap;
  totalFiles: number;
}

/**
 * Environment variables required by the PR agent.
 */
export interface IEnvConfig {
  githubToken: string;
  anthropicApiKey: string;
  prNumber: number;
  headSha: string;
  repoOwner: string;
  repoName: string;
}
