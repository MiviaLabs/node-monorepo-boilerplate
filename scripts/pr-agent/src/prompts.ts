/**
 * Shard Prompt Builder
 *
 * Builds domain-specific prompts for each review shard with strict
 * verification rules to prevent hallucinated findings.
 *
 * @packageDocumentation
 */

import type { IShardPrompt } from './types.js';
import { getShardFiles } from './triage.js';

/**
 * Shard-specific review instructions.
 * Each shard focuses on a different concern and severity level.
 */
const SHARD_INSTRUCTIONS: Record<string, string> = {
  security: `ROLE: P0 Security Reviewer. Report ONLY P0 critical security issues you are CERTAIN about.
Context: .agents/governance/core-guardrails.md
Focus: PII in logs/errors/responses, missing tenant scoping, auth bypasses, injection, hardcoded secrets.
SEVERITY for all findings: P0`,

  'api-architecture': `ROLE: API Architecture Reviewer. Report P1 architecture violations you are CERTAIN about.
Context: .agents/governance/core-guardrails.md, .agents/governance/repo-standards.md
Focus: CQRS violations, missing multi-tenancy in repos, incorrect handler structure, controllers with business logic.
SEVERITY for all findings: P1`,

  'api-quality': `ROLE: API Quality Reviewer. Report P1 quality issues you are CERTAIN about.
Context: .agents/governance/core-guardrails.md, .agents/governance/repo-standards.md
Focus: Missing tests for new logic, missing JSDoc on exports, N+1 queries, error handling gaps.
SEVERITY for all findings: P1`,

  'web-quality': `ROLE: Web Quality Reviewer. Report P1-P2 frontend issues you are CERTAIN about.
Context: .agents/governance/repo-standards.md
Focus: Missing accessibility, no error boundaries, unoptimized images, hardcoded strings.
SEVERITY for all findings: P1 or P2`,

  packages: `ROLE: Shared Packages Reviewer. Report P2 issues you are CERTAIN about.
Context: .agents/governance/repo-standards.md
Focus: Breaking export changes, missing types, magic literals, missing barrel exports.
SEVERITY for all findings: P2`,

  infra: `ROLE: Infrastructure Reviewer. Report P2 issues you are CERTAIN about.
Focus: Unpinned action versions, missing timeouts, secrets in logs, missing concurrency groups, shell script issues.
SEVERITY for all findings: P2`
};

/**
 * Strict rules appended to every shard prompt to prevent hallucinated findings.
 */
const VERIFICATION_RULES = `
CRITICAL RULES — FOLLOW EXACTLY:

1. ONLY report issues you can see DIRECTLY in the diff. Do NOT infer, guess, or hallucinate.
2. Every finding MUST quote the EXACT code line from the diff as "code_snippet". If you cannot quote it, do not report it.
3. Do NOT report issues about code that is not in the diff unless you can see both the old and new version.
4. For "breaking change" findings: you MUST show the OLD signature AND the NEW signature from the diff. If you only see ONE version, you CANNOT claim it changed.
5. The "fix" field MUST contain actual code or a specific actionable command — NOT vague advice like "consider doing X" or "document migration path".
6. Set "confidence" to "high" only if the issue is unambiguous from the diff alone. Use "medium" if you're inferring context. Use "low" if you're guessing.
7. Do NOT report more than 10 findings per shard. Quality over quantity.
8. If you are unsure about a finding, DO NOT INCLUDE IT. Zero false positives is better than catching everything.
`;

/**
 * JSON output schema appended to every shard prompt.
 *
 * @param shard - Shard name to embed in the schema
 * @returns Schema instruction string
 */
function outputSchema(shard: string): string {
  return `
OUTPUT (valid JSON only, no markdown fences, no wrapping text):
{
  "shard": "${shard}",
  "findings": [
    {
      "severity": "P0|P1|P2",
      "category": "string",
      "title": "10 words max — specific, not generic",
      "file": "exact/path/from/diff.ts",
      "line": 42,
      "in_diff": true,
      "code_snippet": "EXACT line copied from the diff — REQUIRED",
      "suggestion": "corrected code replacing code_snippet (omit if no code fix)",
      "issue": "What is wrong. Reference the exact code. 1-2 sentences.",
      "impact": "Concrete consequence if not fixed. 1 sentence.",
      "fix": "Exact code change or shell command to fix. NOT vague advice.",
      "confidence": "high|medium|low"
    }
  ]
}
If NO issues found: {"shard":"${shard}","findings":[]}
IMPORTANT: Empty findings is a VALID and PREFERRED response over low-confidence guesses.`;
}

/**
 * Builds prompt configurations for all active shards.
 *
 * @param shards - List of active shard names
 * @param allFiles - All reviewable files in the PR
 * @param diff - Full PR diff text
 * @returns Array of shard prompt configurations
 */
export function buildShardPrompts(
  shards: string[],
  allFiles: string[],
  diff: string
): IShardPrompt[] {
  return shards.map((name) => {
    const files = getShardFiles(allFiles, name);
    const instructions = SHARD_INSTRUCTIONS[name] ?? `ROLE: ${name} reviewer.`;

    return {
      name,
      instructions: `${instructions}\n\n${VERIFICATION_RULES}\n\nCHANGED FILES:\n${files.join('\n')}\n\nPR DIFF:\n${diff}\n\n${outputSchema(name)}`,
      files,
      diff
    };
  });
}
