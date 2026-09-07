# Guardrails

## Purpose

Define non-negotiable boundaries for safe repository changes.

## Applies

Every agent, provider, task, review, and closure, especially tenant, authorization, Class-C data, tracing, migration, queue, and security work.

## Rules

### Blockers

- Preserve tenant scope on every tenant-scoped read and write.
- Enforce authorization on every protected operation.
- Keep Class-C data, PII, secrets, tokens, and decrypted values out of logs, errors, responses, audit records, and outbox payloads.
- Preserve `requestId`, `correlationId`, and `causationId` across traced flows; initialize them at boundaries and never let handlers invent replacement chains.
- Do not perform destructive data operations without explicit intent and safeguards.
- Do not bypass security, static-analysis, hook, review, or required validation gates.
- Keep data access behind repository or service boundaries; keep result and error handling explicit.

### Required defaults

- Use TDD for new logic and bug fixes unless documentation-only or pure refactor.
- Use real full-stack E2E for auth, session, tenant-routing, and protected web flows.
- Validate DTOs and inputs at boundaries; keep controllers thin.
- Make audit decisions explicit for sensitive reads and all writes, updates, deletes, and access-control changes.
- Review migrations for rollback, rerun, destructive-change, and production-data safety.
- Prevent browser exposure of server-only secrets and internal configuration.
- For BullMQ, workers, schedulers, and key rotation: use bounded retries and idempotency, import `DiscoveryModule` for `@JobHandler`, set BullMQ Redis `maxRetriesPerRequest: null`, and use KMS key `state` with normalized IDs.

### Working discipline

- Prefer repository-native `pnpm` and `nx` commands.
- Never bypass hooks; use conventional commits and PR titles.
- Preserve user intent during intake and disclose meaningful normalization.
- Read relevant memories before planning, implementation, review, and closure.
- Treat repeated known mistakes as process failures and add stronger prevention before closing.
- Update documentation when a public contract, runtime behavior, or operator workflow changes.

## Verification

Run the narrowest relevant tests, security/static-analysis gates, and required full-stack checks. Record exact commands, results, assumptions, reviews, residual risks, and skipped checks in colocated task evidence.

## Authority

This is the highest canonical repository governance document after higher-priority instructions. Application authorization remains implemented by `packages/opa/policies/`; executable analysis rules remain under `tools/semgrep/`.
