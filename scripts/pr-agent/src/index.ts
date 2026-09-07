/**
 * PR Agent — Entry Point
 *
 * Orchestrates: triage → shard analysis → dedup → review posting.
 *
 * @packageDocumentation
 */

import { createOctokit, loadEnvConfig } from './github.js';
import { triageFiles } from './triage.js';
import { buildShardPrompts } from './prompts.js';
import { runAllShards } from './shard.js';
import { deduplicateFindings } from './dedup.js';
import { postReview } from './review.js';

/**
 * Main entry point for the PR agent analysis.
 */
async function main(): Promise<void> {
  const config = loadEnvConfig();
  const octokit = createOctokit(config.githubToken);

  console.log(`PR Agent Analysis — PR #${config.prNumber} @ ${config.headSha.slice(0, 7)}`);

  // ── 1. Triage: classify files, build diff map ──
  const triage = await triageFiles(octokit, config.repoOwner, config.repoName, config.prNumber);

  if (triage.files.length === 0) {
    console.log('No reviewable files changed. Skipping analysis.');
    return;
  }

  if (triage.shards.length === 0) {
    console.log('No shards matched changed files. Skipping analysis.');
    return;
  }

  // ── 2. Build shard prompts ──
  const shardPrompts = buildShardPrompts(triage.shards, triage.files, triage.diff);

  // ── 3. Run all shards in parallel ──
  const results = await runAllShards(shardPrompts);

  // ── 4. Collect all findings ──
  const allFindings = results.flatMap((r) => r.findings);
  console.log(`Total raw findings: ${allFindings.length} from ${results.length} shards`);

  // ── 5. Deduplicate + incremental filter ──
  const { unique, skippedAsReported } = await deduplicateFindings(
    octokit,
    config.repoOwner,
    config.repoName,
    config.prNumber,
    allFindings
  );

  console.log(
    `Unique findings: ${unique.length} (${skippedAsReported} previously reported, skipped)`
  );

  // ── 6. Post review ──
  await postReview(
    octokit,
    config.repoOwner,
    config.repoName,
    {
      prNumber: config.prNumber,
      headSha: config.headSha,
      findings: unique,
      diffMap: triage.diffMap,
      totalFiles: triage.files.length
    },
    skippedAsReported
  );

  console.log('Done.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
