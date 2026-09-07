/**
 * Finding Deduplication
 *
 * Deduplicates findings across shards and filters out previously-reported
 * findings (incremental review) by fingerprinting existing bot comments.
 *
 * @packageDocumentation
 */

import type { Octokit } from '@octokit/rest';

import type { IFinding } from './types.js';

/**
 * Deduplicates findings and filters out already-reported ones (incremental review).
 *
 * @param octokit - Authenticated GitHub client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param findings - Raw findings from all shards
 * @returns Deduplicated findings with skip count
 */
export async function deduplicateFindings(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  findings: IFinding[]
): Promise<{ unique: IFinding[]; skippedAsReported: number }> {
  // ── Step 1: Deduplicate by (file, line, title) ──
  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Step 2: Build fingerprint set from existing bot comments ──
  const reported = new Set<string>();

  try {
    const { data: existingComments } = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100
    });

    for (const c of existingComments) {
      if (c.user?.type !== 'Bot') continue;
      if (!c.body?.includes('AI Fix')) continue;
      const m = c.body.match(/^\*\*\S+ \S+\*\* · (.+)/);
      if (m && c.path) {
        reported.add(`${c.path}::${m[1].trim().toLowerCase()}`);
      }
    }

    const { data: existingReviews } = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100
    });

    for (const r of existingReviews) {
      if (r.user?.type !== 'Bot' || !r.body?.includes('files analyzed')) continue;
      const re = /#### \S+ · (.+?)\n📄 `(.+?):\d+`/g;
      let hit;
      while ((hit = re.exec(r.body!)) !== null) {
        reported.add(`${hit[2]}::${hit[1].trim().toLowerCase()}`);
      }
    }
  } catch (error) {
    console.log(
      `Note: could not fetch previous comments for incremental review - ${(error as Error).message}`
    );
  }

  // ── Step 3: Filter already-reported ──
  let skippedAsReported = 0;
  let unique = deduped;

  if (reported.size > 0) {
    const before = unique.length;
    unique = unique.filter((f) => {
      const key = `${f.file}::${(f.title || '').trim().toLowerCase()}`;
      return !reported.has(key);
    });
    skippedAsReported = before - unique.length;
    console.log(
      `Incremental: ${reported.size} known fingerprints, skipped ${skippedAsReported} already-reported`
    );
  }

  return { unique, skippedAsReported };
}
