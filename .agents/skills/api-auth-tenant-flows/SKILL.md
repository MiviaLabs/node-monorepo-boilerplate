---
name: api-auth-tenant-flows
description: Protect API authentication, session, tenant routing, tracing, auditing, and protected-read performance in NestJS.
---

# API auth and tenant flows

## Scope

Applies to `apps/api` authentication, session refresh, invitations, tenant
propagation, audit events, trace continuity, and protected endpoints.

## When to use

Activate when a change can alter who may access a tenant-scoped resource, how a
protected request is validated, or how its identifiers and audit trail travel.

## What to inspect first

Read only the files that match the task:

- `apps/api/docs/auth/overview.md`
- `apps/api/docs/auth/testing.md`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/common/decorators/tenant.decorator.ts`
- `apps/api/src/common/interceptors/logging.interceptor.ts`
- `apps/api/src/common/services/phase-zero-diagnostics.service.ts`
- `apps/api/src/modules/auth/handlers/queries/validate-token.handler.ts`
- `apps/api/src/modules/auth/handlers/queries/get-auth-bootstrap.handler.ts`
- `apps/api/src/modules/auth/handlers/commands/update-my-profile.handler.ts`

For protected browser flow impact, also load:

- `.agents/memories/lessons-learned.yaml`
- `.agents/governance/core-guardrails.md`

## Required behavior

- Identify the boundary: controller, guard, handler, token validation,
  tenant middleware, or audit/outbox flow.
- Carry `tenantId`, `actorId`, `requestId`, `correlationId`, and `causationId`
  explicitly across the flow.
- Never infer tenant scope from ambient request state inside handlers or repositories.
- Decide explicitly whether a write emits an audit event, domain event, both, or neither.
- Measure validation/bootstrap counts and fallback behavior before changing a hot path.
- Keep the healthy path to one validation, one bootstrap or shell read, and
  explicit degraded-mode fallbacks.
- Reject duplicate validation, bootstrap, or helper-level audit work unless the
  higher-level action requires it.
- Keep high-cardinality identifiers in logs/traces, not metric labels.
- Reject caches for auth decisions, revocation state, signed URLs, decrypted
  values, or payloads without clear invalidation ownership.

## Repository-specific rules

- Keep controllers thin; business logic belongs in commands, queries, and handlers.
- Preserve tenant isolation on reads and writes.
- Never put PII, tokens, or secrets in logs or audit payloads.
- Do not let read-path auditing or token validation fan out into repeated helper work without an explicit performance reason.
- If diagnostics or tracing is added to a hot path, preserve correlation across hops without adding high-cardinality metric labels.
- Fallback auth, tenant, or bootstrap behavior must be an explicit degraded mode with diagnostics instead of a silent replacement for the healthy path.
- If a write emits events, keep outbox writes in the same transaction as state changes; record an explicit exception when no atomic event is required.
- Prefer existing auth helpers and DTO patterns over ad hoc request parsing.
- Inventory every write owner before expanding a metadata cache on auth-adjacent paths, including admin handlers and auth-owned delete or rotate flows that can mutate the same resource.

## Verification

- Confirm tenant and trace identifiers at each boundary.
- Confirm audit decisions and hot-path budgets in task evidence.
- Use unit/integration tests for local behavior and real full-stack E2E for
  auth, session, tenant-routing, or protected-browser changes.

## Exclusions

Do not broaden generic data access, silently replace healthy auth with a
fallback, log PII/tokens/secrets, or add a cache as a substitute for ownership.
