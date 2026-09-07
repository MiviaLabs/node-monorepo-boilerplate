---
name: api-testcontainers-jest-e2e
description: Build API integration and E2E tests with NestJS, Jest, Testcontainers, and explicit tenant fixtures.
---

# API Testcontainers and Jest E2E

## Scope

Applies to `apps/api/test` and any API test requiring real NestJS bootstrap,
database state, Testcontainers, or tenant-aware requests.

## When to use

Use when mocks cannot prove DI wiring, request behavior, persistence, tenancy,
cookies, headers, or transactional outbox behavior.

## What to inspect first

- `apps/api/docs/testing/e2e-testing-guide.md`
- `apps/api/test/helpers/bootstrap.ts`
- `apps/api/test/helpers/database.ts`
- `apps/api/test/helpers/auth.helper.ts`
- `.agents/standards/testing.md`

## Required behavior

- Choose the narrowest test that proves the behavior.
- Use Jest E2E when NestJS DI or a real request flow is involved; do not substitute `node:test`.
- Reuse shared bootstrap, database, auth, and fixture helpers.
- Create tenant, organization, and user-tenant membership explicitly.
- Verify headers, cookies, auth boundaries, and cleanup with real requests.

## Repository-specific rules

- `apps/api` E2E uses Jest plus Testcontainers or the local daemon-backed test database flow.
- Keep main and events schemas on the same physical Postgres instance for transactional outbox coverage.
- Prefer helper factories from `apps/api/test/helpers/` and `apps/api/test/fixtures/`.
- Record exact setup and execution commands in task evidence.

## Verification

- Keep main and events schemas on the same physical Postgres instance for
  transactional outbox coverage.
- Record exact setup and execution commands in task evidence.
- Prove the changed behavior fails without the implementation.

## Exclusions

Do not invent local bootstrap or fixture conventions, leave tenant/outbox data
behind, or claim protected-flow coverage from mocks alone.
