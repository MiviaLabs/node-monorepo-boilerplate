/**
 * Shard Runner
 *
 * Executes the configured review command for each review shard, extracts JSON findings,
 * and validates them to filter out hallucinated or low-confidence results.
 *
 * @packageDocumentation
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import type { IFinding, IShardPrompt, IShardResult } from './types.js';

/** Maximum time to wait for review command response per shard (ms). */
const REVIEW_TIMEOUT_MS = 120_000;

/** Provider-neutral review command injected by environment. */
const REVIEW_COMMAND = process.env.AGENTIC_REVIEW_COMMAND;

/** Vague fix patterns that indicate the model is guessing. */
const VAGUE_FIX_PATTERNS = [
  /^consider /i,
  /^you (should|could|might|may) /i,
  /^(document|ensure|make sure|verify that|check that) /i,
  /^keep returning/i,
  /migration path/i,
  /backward compat/i,
  /or document/i,
  /major version bump/i,
  /^either.+or.+or/i
];

/**
 * Runs a single review shard by calling the configured review command.
 *
 * @param shard - Shard prompt configuration
 * @returns Shard result with extracted findings
 */
export async function runShard(shard: IShardPrompt): Promise<IShardResult> {
  const promptPath = `/tmp/pr-agent-prompt-${shard.name}.txt`;
  writeFileSync(promptPath, shard.instructions);

  console.log(`[${shard.name}] Running analysis (${shard.files.length} files)...`);

  try {
    if (!REVIEW_COMMAND) {
      throw new Error('AGENTIC_REVIEW_COMMAND is not set');
    }

    const raw = execSync(`${REVIEW_COMMAND} < ${promptPath}`, {
      encoding: 'utf-8',
      timeout: REVIEW_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env }
    });

    const rawSize = Buffer.byteLength(raw, 'utf-8');
    console.log(`[${shard.name}] Got ${rawSize} bytes of output`);

    const findings = extractFindings(raw, shard.name);
    const validated = validateFindings(findings, shard.name);
    console.log(`[${shard.name}] ${findings.length} raw → ${validated.length} validated findings`);

    return { shard: shard.name, findings: validated };
  } catch (error) {
    console.warn(`[${shard.name}] Review command failed: ${(error as Error).message}`);
    return { shard: shard.name, findings: [] };
  }
}

/**
 * Runs all shards in parallel and collects results.
 *
 * @param shards - Array of shard prompt configurations
 * @returns Array of shard results (settled, never throws)
 */
export async function runAllShards(shards: IShardPrompt[]): Promise<IShardResult[]> {
  const results = await Promise.allSettled(shards.map((s) => runShard(s)));
  const collected: IShardResult[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      collected.push(result.value);
    } else {
      console.warn(`Shard failed: ${result.reason}`);
    }
  }

  return collected;
}

/**
 * Validates findings and filters out garbage.
 * Drops findings that are low-confidence, missing required fields,
 * or contain vague/hallucinated content.
 *
 * @param findings - Raw findings from extraction
 * @param shardName - Shard name for logging
 * @returns Validated findings only
 */
function validateFindings(findings: IFinding[], shardName: string): IFinding[] {
  return findings.filter((f) => {
    // Must have file and line
    if (!f.file || !f.line || f.line <= 0) {
      console.log(`[${shardName}] Dropped: missing file/line — "${f.title}"`);
      return false;
    }

    // Must have issue description
    if (!f.issue || f.issue.trim().length < 10) {
      console.log(`[${shardName}] Dropped: empty/short issue — "${f.title}"`);
      return false;
    }

    // Must have code_snippet (proves it's from the diff, not hallucinated)
    if (!f.code_snippet || f.code_snippet.trim().length === 0) {
      console.log(`[${shardName}] Dropped: no code_snippet — "${f.title}" at ${f.file}:${f.line}`);
      return false;
    }

    // Drop low confidence
    if (f.confidence === 'low') {
      console.log(`[${shardName}] Dropped: low confidence — "${f.title}" at ${f.file}:${f.line}`);
      return false;
    }

    // Replace vague fix instructions
    if (f.fix && isVagueFix(f.fix)) {
      console.log(
        `[${shardName}] Warning: vague fix replaced — "${f.title}" at ${f.file}:${f.line}`
      );
      f.fix = `Review ${f.file}:${f.line} and verify: ${f.issue}`;
    }

    return true;
  });
}

/**
 * Detects vague, non-actionable fix instructions.
 *
 * @param fix - Fix instruction text
 * @returns True if the fix is vague
 */
function isVagueFix(fix: string): boolean {
  const trimmed = fix.trim();
  if (trimmed.length < 15) return true;
  return VAGUE_FIX_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Extracts JSON findings from raw review command output.
 * Handles multiple formats: raw JSON, CLI envelope, markdown fences, embedded JSON.
 *
 * @param raw - Raw text output from Claude CLI
 * @param shardName - Shard name for tagging findings
 * @returns Array of findings with reviewer tag
 */
function extractFindings(raw: string, shardName: string): IFinding[] {
  const text = raw.trim();
  if (!text) {
    console.warn(`[${shardName}] Empty output from review command`);
    return [];
  }

  const strategies: Array<(t: string) => unknown | null> = [
    tryDirect,
    tryEnvelope,
    tryFences,
    tryRegex
  ];

  for (const strategy of strategies) {
    const result = strategy(text);
    if (result && typeof result === 'object' && 'findings' in (result as Record<string, unknown>)) {
      const findings = ((result as Record<string, unknown>).findings as IFinding[]) || [];
      return findings.map((f) => ({ ...f, reviewer: shardName }));
    }
  }

  console.warn(`[${shardName}] No valid JSON found in ${text.length} bytes`);
  console.warn(`[${shardName}] First 300 chars: ${text.slice(0, 300)}`);
  return [];
}

/** Attempt 1: Parse raw text as JSON directly. */
function tryDirect(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Attempt 2: Unwrap a JSON envelope if the provider returns one. */
function tryEnvelope(text: string): unknown | null {
  try {
    const outer = JSON.parse(text) as Record<string, unknown>;
    if (outer && typeof outer === 'object' && 'type' in outer && 'result' in outer) {
      return JSON.parse(outer.result as string);
    }
  } catch {
    /* not an envelope */
  }
  return null;
}

/** Attempt 3: Strip markdown code fences and parse. */
function tryFences(text: string): unknown | null {
  const stripped = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  try {
    return JSON.parse(stripped.trim());
  } catch {
    return null;
  }
}

/** Attempt 4: Find first JSON object `{...}` in mixed text. */
function tryRegex(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* not valid JSON */
    }
  }
  return null;
}
