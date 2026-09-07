# Backend Governance

## Purpose

Set mandatory backend boundaries not captured by a task-specific skill.

## Applies

`apps/api`, shared backend packages, database changes, event/outbox flows, queues, jobs, and repository code.

## Rules

- Keep controllers thin, validate DTOs at boundaries, version public controllers when the API contract is versioned, and avoid duplicate route prefixes.
- Separate commands from queries. Access tenant data through repositories or services requiring tenant context; do not hide cross-tenant reads in helpers, caches, joins, or read composition.
- Shape hot reads at the query boundary. Measure call count, latency, fallback behavior, and budgets before changing a hot path.
- Preserve `requestId`, `correlationId`, and `causationId` through HTTP, handlers, queries, diagnostics, events, audit, and outbox flows. Make fallback paths explicit and measurable.
- Add distributed caching only after query shaping and fan-out reduction are proven insufficient; define key ownership, invalidation, freshness, and stale-read detection first.
- Treat Drizzle schemas under `packages/db-core/src/schemas` as source of truth. Run `pnpm db:generate`, review generated SQL, and use `pnpm db:migrate` for local validation.
- Make migrations rerunnable where practical, review destructive changes, prefer additive rollout, and check assumptions against production-like data.
- Make retries bounded and idempotent. Treat startup order as unreliable and failure handling as observable.
- Keep audit/outbox payloads metadata-only. Persist audit/domain events transactionally with state changes when practical and avoid audit amplification on hot reads.

## Verification

Run targeted backend tests plus migration, tracing, tenant-safety, audit/outbox, and queue checks required by the changed risk area. Inspect generated SQL before applying schema changes.

## Authority

This file owns backend execution guidance. Guardrails own non-negotiable safety rules; specialized skills add procedures; application authorization remains in OPA.
