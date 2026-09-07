# Testing standard

## Test selection

Choose the narrowest test that proves the behavior, then add broader coverage when the boundary is consequential.

| Change                              | Minimum useful proof                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| Pure function or mapper             | Unit test                                                           |
| NestJS provider/handler             | Unit test with explicit dependency seams                            |
| Drizzle schema/query                | Package unit test; Testcontainers integration test for SQL behavior |
| API auth, tenant, or protected flow | Full-stack E2E plus focused unit/integration coverage               |
| React behavior                      | Vitest component/interaction test                                   |
| Cross-page browser behavior         | Playwright E2E                                                      |
| Docs/configuration                  | Formatter, link/render validation, and relevant parser/linter       |

## Required behavior

- Name tests by observable behavior and failure condition, not implementation trivia.
- Keep tests isolated: control time, randomness, environment, network, and database lifecycle.
- Prefer real package boundaries and repository test utilities; mock only external systems or a deliberately isolated collaborator.
- Assert security properties directly: tenant scope, authorization result, redaction, and rejection of invalid input.
- Keep fixtures minimal and representative. Never place credentials, customer data, or copied production records in tests.
- When a bug is fixed, retain a test that would fail under the old behavior.

## Verification

Use the package or Nx target shown by the workspace. Before completion, run `pnpm test:agentic` for agent-contract changes and report skipped checks with a reason.
