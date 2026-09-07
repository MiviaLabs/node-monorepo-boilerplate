# Review Governance

## Purpose

Make reviews actionable, independent, and focused on user impact.

## Applies

Implementation, refactor, documentation, contract, security, data, and generated-surface changes.

## Rules

- Inspect the diff and impacted surrounding code, not only touched lines.
- Report specific, reproducible findings tied to a file, command, or behavior before giving a summary.
- Check security, regression risk, testing gaps, rollback or migration safety, and operational failure paths when in scope.
- Identify repeats of known mistakes and require stronger prevention.
- For React changes, verify Effects synchronize with external systems rather than derive state or handle user events.
- Prefer no finding over an unsubstantiated low-confidence claim.

## Verification

Record reviewer role, scope, commands or files inspected, findings, disposition, and unresolved risks in task evidence. A required review must pass before closure.

## Authority

This file governs review quality. The task schema decides required reviews; security and tenant guardrails remain blocking.
