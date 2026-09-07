# Repository Governance

## Purpose

Define cross-cutting engineering defaults for this monorepo.

## Applies

All packages and applications unless a closer path instruction or specialized skill is stricter.

## Rules

- Use repository-native `pnpm` and `nx` entrypoints; let direct tools and CI remain the truth source.
- Derive UI state during render or explicit event/action paths. Add React Effects only to synchronize with a named external system.
- Before changing a hot path, record expected validation, bootstrap, fetch/query, latency, and fallback budgets. Keep protected Next.js paths bounded.
- Preserve one trace chain across middleware, SSR, proxy routes, API calls, and downstream work.
- Do not introduce broad scans, hidden retries, or silent degraded fallbacks on hot routes.
- Use parallel agents only for read-only research or explicitly disjoint ownership. Declare ownership before edits.
- Review changed and impacted files, report findings before summaries, and re-check assumptions against the current tree.
- Use the narrowest proving test first, then add integration or E2E coverage at real boundaries. Record intentionally skipped checks.
- Read relevant memory entries and strengthen prevention when a known mistake recurs.

## Verification

Use the task's declared checks and reviews. Confirm changed and impacted behavior, run relevant tests, and retain exact evidence before closure.

## Authority

This file supplies repository-wide defaults. Guardrails, task schemas, workflows, path instructions, and specialized skills may add requirements but cannot weaken safety or authorization.
