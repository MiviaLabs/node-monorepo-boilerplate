/**
 * Review Posting Module
 *
 * Posts PR reviews with inline comments and summary body.
 * Uses 3-tier fallback: batch → split → issue comment.
 *
 * @packageDocumentation
 */

import type { Octokit } from '@octokit/rest';

import type { IReviewParams } from './types.js';
import { buildReviewBody, formatInlineComment } from './format.js';

/**
 * Posts a PR review with inline comments and summary.
 * Uses 3-tier fallback: batch → split → issue comment.
 *
 * @param octokit - Authenticated GitHub client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param params - Review parameters (PR number, SHA, findings, etc.)
 * @param skippedAsReported - Count of previously-reported findings skipped
 */
export async function postReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  params: IReviewParams,
  skippedAsReported: number
): Promise<void> {
  const { prNumber, headSha, findings, diffMap, totalFiles } = params;

  // ── Classify findings ──
  const inDiff = findings.filter((f) => diffMap[f.file]?.includes(f.line));
  const outOfDiff = findings.filter((f) => !diffMap[f.file]?.includes(f.line));
  const p0 = findings.filter((f) => f.severity === 'P0');
  const p1 = findings.filter((f) => f.severity === 'P1');
  const p2 = findings.filter((f) => f.severity !== 'P0' && f.severity !== 'P1');

  console.log(
    `Findings: ${findings.length} total (${inDiff.length} in-diff, ${outOfDiff.length} out-of-diff)`
  );
  console.log(`Severity: P0=${p0.length} P1=${p1.length} P2=${p2.length}`);

  // ── Dismiss stale bot reviews ──
  await dismissStaleReviews(octokit, owner, repo, prNumber);

  // ── Build inline comments (cap at 60) ──
  const MAX_INLINE_COMMENTS = 60;
  const comments = inDiff.slice(0, MAX_INLINE_COMMENTS).map((f) => ({
    path: f.file,
    line: f.line,
    side: 'RIGHT' as const,
    body: formatInlineComment(f)
  }));

  if (inDiff.length > MAX_INLINE_COMMENTS) {
    console.log(`Warning: ${inDiff.length} inline findings, capped to ${MAX_INLINE_COMMENTS}`);
  }

  // ── Build review body ──
  const body = buildReviewBody(
    findings,
    inDiff,
    outOfDiff,
    p0,
    p1,
    p2,
    totalFiles,
    skippedAsReported
  );

  // ── Determine event ──
  const event = p0.length > 0 ? ('REQUEST_CHANGES' as const) : ('COMMENT' as const);

  // ── Post with 3-tier fallback ──
  await postWithFallback(octokit, owner, repo, prNumber, headSha, event, body, comments);

  // ── Create check run ──
  try {
    await octokit.rest.checks.create({
      owner,
      repo,
      head_sha: headSha,
      name: 'PR Agent Analysis',
      status: 'completed',
      conclusion: p0.length > 0 ? 'failure' : 'success',
      output: {
        title:
          p0.length > 0
            ? `${p0.length} P0 issue${p0.length > 1 ? 's' : ''} — changes requested`
            : findings.length > 0
              ? `${findings.length} finding${findings.length > 1 ? 's' : ''} (no blockers)`
              : 'No issues found',
        summary: body.substring(0, 65000)
      }
    });
  } catch (error) {
    console.warn(`Could not create check run: ${(error as Error).message}`);
  }
}

/**
 * Posts review with 3-tier fallback:
 * 1. Batch: review + all inline comments in one API call
 * 2. Split: review body only, then individual comments
 * 3. Issue comment: plain PR comment with everything
 */
async function postWithFallback(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  event: 'REQUEST_CHANGES' | 'COMMENT',
  body: string,
  comments: Array<{ path: string; line: number; side: 'RIGHT'; body: string }>
): Promise<void> {
  // ── Tier 1: Batch review ──
  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: headSha,
      event,
      body,
      comments: comments.length > 0 ? comments : undefined
    });
    console.log(`Posted review (${event}) with ${comments.length} inline comments`);
    return;
  } catch (error) {
    console.log(`Tier 1 (batch) failed: ${(error as Error).message}`);
  }

  // ── Tier 2: Review body only + individual comments ──
  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: headSha,
      event,
      body
    });
    console.log(`Posted review (${event}) — body only`);

    let posted = 0;
    for (const c of comments) {
      try {
        await octokit.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          commit_id: headSha,
          path: c.path,
          line: c.line,
          side: c.side,
          body: c.body
        });
        posted++;
      } catch {
        /* line not in diff, skip */
      }
    }
    console.log(`Posted ${posted}/${comments.length} individual inline comments`);
    return;
  } catch (error) {
    console.log(`Tier 2 (split) failed: ${(error as Error).message}`);
  }

  // ── Tier 3: Issue comment (always works) ──
  try {
    let fallbackBody = body;
    if (comments.length > 0) {
      fallbackBody += '\n\n---\n\n';
      fallbackBody += `_${comments.length} inline comments could not be placed on diff lines:_\n\n`;
      for (const c of comments) {
        fallbackBody += `**\`${c.path}:${c.line}\`**\n${c.body}\n\n---\n`;
      }
    }
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: fallbackBody
    });
    console.log('Posted fallback issue comment');
  } catch (error) {
    console.error(`All 3 tiers failed. Last error: ${(error as Error).message}`);
  }
}

/**
 * Dismisses stale bot reviews to avoid blocking merge with outdated REQUEST_CHANGES.
 */
async function dismissStaleReviews(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  try {
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100
    });

    for (const r of reviews) {
      if (
        r.user?.type === 'Bot' &&
        r.state === 'CHANGES_REQUESTED' &&
        r.body?.includes('files analyzed')
      ) {
        await octokit.rest.pulls.dismissReview({
          owner,
          repo,
          pull_number: prNumber,
          review_id: r.id,
          message: 'Superseded by new analysis run.'
        });
        console.log(`Dismissed stale review ${r.id}`);
      }
    }
  } catch (error) {
    console.log(`Note: could not dismiss old reviews - ${(error as Error).message}`);
  }
}
