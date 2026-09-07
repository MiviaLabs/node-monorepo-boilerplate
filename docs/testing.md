# 🧪 Testing

Three test tiers, all runnable from the root:

| Tier               | Command                                                                             | Runner                            | Needs Docker?       |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------- | ------------------- |
| Unit (API)         | `pnpm test:api:unit`                                                                | jest                              | ❌                  |
| API e2e            | `pnpm test:api:e2e`                                                                 | jest + supertest + testcontainers | ✅                  |
| Web e2e            | `pnpm test:web:e2e`                                                                 | Playwright (`apps/web-e2e`)       | ✅ (runs the stack) |
| Admin tests        | `pnpm test:admin`                                                                   | vitest (`apps/admin`)             | ❌                  |
| Package tests      | `pnpm test:types` · `test:utils` · `test:schema` · `test:constants` · `test:errors` | node test runner / jest           | ❌                  |
| Docs tooling tests | `pnpm test:docs`                                                                    | jest (`scripts/docs`)             | ❌                  |
| Mobile             | `nx test mobile`                                                                    | vitest                            | ❌                  |

## 🧪 API unit tests

- Live next to the code: `apps/api/src/modules/*/**/__tests__/*.unit.test.ts`.
- Handlers are tested with mocked repositories; controllers with mocked
  handlers; guards/filters/interceptors in `src/common/**/__tests__`.
- Run a single file:

```bash
cd apps/api
node ../../node_modules/jest/bin/jest.js src/modules/users --silent
```

## 🌍 API e2e

- Specs in `apps/api/test/e2e/**` grouped by domain
  (`auth/`, `issues/`, `events/`, `tenants/`, `users/`, `storage/`, …).
- `packages/test-utils` spins up **Testcontainers** PostgreSQL/Redis/Kafka and
  applies real migrations, so e2e runs against the actual schema.
- Full pipeline: `pnpm test:api:e2e` =
  `build:packages → test:e2e:setup → test:e2e → test:e2e:teardown`.

## 🎭 Browser e2e

- `apps/web-e2e` — Playwright specs for auth, projects, issues, content flows.
- `apps/admin-e2e` — operator login & console flows.
- Both have `scripts/start-api-e2e.mjs` helpers that boot the API with e2e
  env.

## 🧱 Conventions

- Name files `*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.spec.ts` —
  jest projects select on these patterns.
- Fixtures live in `__tests__/fixtures/` (user, tenant, project, auth…).
- Integration tests that hit a database must create it through
  `packages/test-utils` helpers (`setupTestDatabaseJest`) so migrations and the
  migrations table match production.
- Never mock what you can integrate for cheap; never integrate what CI can't
  provision — that's what the tiers are for.
