/**
 * Comment & Review Body Formatting
 *
 * Formats inline review comments and the review summary body
 * with severity badges, collapsible sections, and combined fix prompts.
 *
 * @packageDocumentation
 */

import type { IFinding } from './types.js';

/**
 * Formats an inline review comment body for a finding.
 *
 * @param f - The finding to format
 * @returns Markdown comment body
 */
export function formatInlineComment(f: IFinding): string {
  const confidence = f.confidence ? ` · ${f.confidence} confidence` : '';
  let body = `**${f.severity} ${f.category}** · ${f.title}${confidence}\n\n${f.issue}`;

  if (f.impact) body += `\n\n**Impact:** ${f.impact}`;

  if (f.suggestion) {
    body += `\n\n\`\`\`suggestion\n${f.suggestion}\n\`\`\``;
  }

  if (f.fix && f.fix.trim().length > 0) {
    body += '\n\n<details>\n<summary>🔧 AI Fix</summary>\n\n';
    body += '> ⚠️ Verify this finding against the actual code before applying\n\n';
    body += '```\n';
    body += `# File: ${f.file}\n`;
    body += `# Line: ${f.line}\n`;
    body += `# Found: ${f.code_snippet || 'N/A'}\n`;
    body += '#\n';
    body += '# Fix:\n';
    body += `${f.fix}\n`;
    body += '#\n';
    body += '# Verify: run tests for this module after applying\n';
    body += '```';
    body += '\n\n</details>';
  }

  return body;
}

/**
 * Builds the review body (summary + out-of-diff findings + combined fix prompt).
 *
 * @param all - All unique findings
 * @param inDiff - Findings on changed lines (will have inline comments)
 * @param outOfDiff - Findings outside changed lines (listed in body)
 * @param p0 - P0 severity findings
 * @param p1 - P1 severity findings
 * @param p2 - P2+ severity findings
 * @param totalFiles - Total files analyzed
 * @param skippedAsReported - Count of previously-reported findings skipped
 * @returns Markdown review body
 */
export function buildReviewBody(
  all: IFinding[],
  inDiff: IFinding[],
  outOfDiff: IFinding[],
  p0: IFinding[],
  p1: IFinding[],
  p2: IFinding[],
  totalFiles: number,
  skippedAsReported: number
): string {
  const lines: string[] = [];

  // ── Summary line ──
  if (all.length === 0) {
    lines.push('✅ No issues found. Looks good!');
  } else if (p0.length > 0) {
    lines.push(
      `🚨 **${p0.length} critical issue${p0.length > 1 ? 's' : ''} must be fixed before merge.**`
    );
  } else if (p1.length > 0) {
    lines.push(`⚠️ **${p1.length} issue${p1.length > 1 ? 's' : ''} found** — please review.`);
  } else {
    lines.push(`📝 **${p2.length} suggestion${p2.length > 1 ? 's' : ''}** — no blocking issues.`);
  }

  // ── Severity breakdown ──
  if (all.length > 0) {
    lines.push('');
    const parts: string[] = [];
    if (p0.length > 0) parts.push(`🚨 ${p0.length} P0`);
    if (p1.length > 0) parts.push(`⚠️ ${p1.length} P1`);
    if (p2.length > 0) parts.push(`📝 ${p2.length} P2`);
    if (inDiff.length > 0) parts.push(`${inDiff.length} inline`);
    if (outOfDiff.length > 0) parts.push(`${outOfDiff.length} general`);
    lines.push(parts.join(' · '));
  }

  // ── Skipped findings note ──
  if (skippedAsReported > 0) {
    lines.push('');
    lines.push(
      `_ℹ️ ${skippedAsReported} previously reported finding${skippedAsReported > 1 ? 's' : ''} skipped._`
    );
  }

  // ── Out-of-diff findings ──
  if (outOfDiff.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('<details>');
    lines.push(
      `<summary>📋 ${outOfDiff.length} finding${outOfDiff.length > 1 ? 's' : ''} outside changed lines</summary>`
    );
    lines.push('');

    for (const f of outOfDiff) {
      const confidence = f.confidence ? ` · ${f.confidence} confidence` : '';
      lines.push(`#### ${f.severity} · ${f.title}${confidence}`);
      lines.push(`📄 \`${f.file}:${f.line}\``);
      lines.push('');
      lines.push(f.issue);
      if (f.impact) lines.push(`\n**Impact:** ${f.impact}`);
      if (f.code_snippet) {
        lines.push('');
        lines.push('```');
        lines.push(f.code_snippet);
        lines.push('```');
      }

      if (f.fix && f.fix.trim().length > 0) {
        lines.push('');
        lines.push('<details>');
        lines.push('<summary>🔧 AI Fix</summary>');
        lines.push('');
        lines.push('> ⚠️ Verify against actual code before applying');
        lines.push('');
        lines.push('```');
        lines.push(`# File: ${f.file}`);
        lines.push(`# Line: ${f.line}`);
        lines.push(`# Found: ${f.code_snippet || 'N/A'}`);
        lines.push('#');
        lines.push('# Fix:');
        lines.push(f.fix);
        lines.push('#');
        lines.push('# Verify: run tests for this module after applying');
        lines.push('```');
        lines.push('');
        lines.push('</details>');
      }

      lines.push('');
    }

    lines.push('</details>');
  }

  // ── Combined fix prompt ──
  if (all.length > 0) {
    lines.push('');
    lines.push('<details>');
    lines.push(
      `<summary>🔧 Fix all ${all.length} finding${all.length > 1 ? 's' : ''} — combined prompt</summary>`
    );
    lines.push('');
    lines.push('```');
    lines.push('# PR Review Findings — Fix All');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push(`# Total: ${all.length} findings`);
    lines.push('# IMPORTANT: Verify each finding against actual code before fixing.');
    lines.push('# Some findings may be false positives — confirm the issue exists.');
    lines.push('');

    all.forEach((f, i) => {
      lines.push(`# ${i + 1}. [${f.severity}] ${f.file}:${f.line} — ${f.title}`);
      lines.push(`#    Code: ${f.code_snippet || 'N/A'}`);
      lines.push(`#    Issue: ${f.issue}`);
      if (f.impact) lines.push(`#    Impact: ${f.impact}`);
      lines.push(`#    Fix: ${f.fix || 'Review and fix manually'}`);
      lines.push(`#    Confidence: ${f.confidence || 'unknown'}`);
      lines.push('');
    });

    lines.push('```');
    lines.push('');
    lines.push('</details>');
  }

  // ── Footer ──
  lines.push('');
  lines.push(`_${new Date().toISOString()} · ${totalFiles} files analyzed_`);

  return lines.join('\n');
}
