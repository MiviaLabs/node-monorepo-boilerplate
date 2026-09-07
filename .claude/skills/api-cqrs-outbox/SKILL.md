---
name: api-cqrs-outbox
description: Shape NestJS controllers, CQRS handlers, repositories, and transactional outbox writes without losing tenant or read-path safety.
---

# API CQRS and outbox

## Scope

Applies to `apps/api` controllers, commands, queries, handlers, repositories,
DTOs, read models, and outbox publishing.

## When to use

Use when a change crosses a transport boundary, mutates state, emits an event,
or changes a latency-sensitive read.

## What to inspect first

- `.agents/standards/backend.md`
- `apps/api/docs/events/README.md`
- `apps/api/docs/auth/cqrs.md`
- `apps/api/docs/events/outbox-pattern.md`
- `apps/api/src/modules/auth/controllers/auth.controller.ts`
- `apps/api/src/modules/auth/handlers/commands/update-my-profile.handler.ts`

## Required behavior

- Keep controllers as transport adapters: validate, decorate, and dispatch.
- Put orchestration, validation, transactions, and repository calls in handlers.
- Keep queries side-effect free.
- Commit related state changes and outbox inserts in one transaction.
- Shape hot reads with one bounded query or read model before considering a cache.
- Return the module's established DTOs and response envelopes.

## Repository-specific rules

- Repository calls should take tenant scope explicitly when applicable.
- Do not publish events outside the transaction when the state change and event must stay consistent.
- Do not let outbox or audit additions silently tax hot protected read paths through helper-level repetition or extra generic reads.
- Reuse existing command, query, DTO, and event naming patterns in each module.
- For `db-core` structure changes, update Drizzle schema files in `packages/db-core/src/schemas` first, then generate migrations with `pnpm db:generate` and review the SQL in `packages/db-core/drizzle`.
- When a handler mutates security-sensitive or tenant-scoped data, recheck audit and trace requirements before closure.

## Verification

- Repository calls carry tenant scope on every tenant-owned read and write.
- Events are not published as best-effort post-commit side effects when state and event must be atomic; document why when they are intentionally independent.
- Unit tests cover success, validation failures, and transactional side effects.
- Protected auth or tenant effects have real full-stack E2E coverage.

## Exclusions

Do not put business logic in controllers, make queries mutate state, or hide
extra generic reads/audits in helpers. For `db-core`, edit
`packages/db-core/src/schemas` first, run `pnpm db:generate`, and review the
generated SQL in `packages/db-core/drizzle`.
