---
name: api-cqrs-tenant-safety
description: Keep NestJS CQRS boundaries, tenant scope, bounded reads, and protected-flow validation safe.
---

# API CQRS tenant safety

## Scope

Applies to `apps/api` controllers, handlers, repositories, read models, and
protected flows where tenant isolation or read cost can change.

## When to use

Activate before changing a tenant-scoped read/write or any hot protected path.

## Inspect first

- `.agents/standards/backend.md`
- `apps/api/docs/README.md`
- `apps/api/docs/auth/cqrs.md`
- `apps/api/docs/auth/multi-tenancy.md`
- `apps/api/src/common/decorators/tenant.decorator.ts`

## Required behavior

- Classify the change as `hot-read`, `cold-read`, or `write-adjacent`.
- Keep controllers thin; dispatch through `CommandBus` or `QueryBus`.
- Carry tenant scope explicitly through commands, queries, and repositories.
- Keep commands mutating and queries side-effect free.
- For hot reads, document the bounded query or read model before editing.
- Paginate before expensive enrichment, decryption, or joins.
- Define invalidation ownership, write-owner coverage, and freshness measures
  before approving a cache; defer it when any is weaker than the uncached path.

## Repository rules

- Do not move business logic into controllers.
- Do not infer tenant scope implicitly inside data access.
- Do not ship fetch-all, fallback-to-all, or broad post-query filtering on hot read paths when a bounded query can answer the request.
- Do not compose many generic repository reads on a hot path when one query handler or read model can answer the request.
- Do not add new distributed read caches until invalidation ownership and freshness metrics are defined.
- Do not cache auth decisions, session revocation state, signed URLs, decrypted PII, or other unstable/security-critical values on hot paths.
- Do not approve a new narrow cache until every write owner that can mutate the cached payload is listed, including cross-module handlers and indirect deletion flows.
- For `db-core` schema changes, edit `packages/db-core/src/schemas` first and then generate reviewed migrations through the repo script `pnpm db:generate`.
- Match test scope to risk, not convenience.

## Verification

- Check for fetch-all, fallback-to-all, broad in-memory filtering, and hidden
  multi-read fan-out on hot paths.
- Match tests and review depth to the risk; protected flows require real full-stack E2E.

## Exclusions

Never infer tenant scope in data access, cache auth decisions/revocation state/
signed URLs/decrypted PII, or approve a narrow cache without listing every
write owner, including indirect deletion flows.
