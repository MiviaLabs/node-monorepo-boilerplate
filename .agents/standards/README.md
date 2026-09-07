# Engineering standards

This directory is the repository-specific engineering guide for agents and reviewers. It describes decisions that are useful when changing this Nx monorepo; it is not a generic framework tutorial.

## Start here

1. Read the applicable standard before editing.
2. Check the package and path instructions nearest to the files you will change.
3. Treat executable configuration and tests as the final authority when prose disagrees with code.
4. Run the smallest relevant checks, then the required repository gates.

## Standards map

| File                                 | Applies to                                                                |
| ------------------------------------ | ------------------------------------------------------------------------- |
| [engineering.md](engineering.md)     | Every change: TypeScript, structure, dependencies, maintainability        |
| [backend.md](backend.md)             | `apps/api`, backend packages, HTTP and background work                    |
| [frontend.md](frontend.md)           | `apps/web`, `apps/admin`, React and Next.js code                     |
| [testing.md](testing.md)             | Unit, integration, E2E, fixtures, and verification                        |
| [security.md](security.md)           | Authentication, authorization, tenant data, secrets, and sensitive output |
| [cqrs.md](cqrs.md)                   | NestJS CQRS, repositories, events, and transactional writes               |
| [review.md](review.md)               | Review scope, risk assessment, and completion quality                     |
| [documentation.md](documentation.md) | READMEs, API docs, JSDoc, diagrams, and generated documentation           |

## Ownership

These documents guide agent behavior. Mandatory runtime guardrails, task closure, and routing belong to `.agents/governance/`; application authorization remains in `packages/opa/policies/`; executable static-analysis rules remain under `tools/semgrep/`. Do not copy those contracts here.

## Verification anchors

- `pnpm lint`, `pnpm typecheck:all`, and `pnpm test:agentic` for general changes.
- `pnpm lint:docs` for documentation rules.
- `pnpm opa:check:authz`, `pnpm opa:test:authz`, and `pnpm opa:check:metadata` for authorization changes.
- Relevant Nx, Jest, Vitest, Playwright, Testcontainers, and package checks for changed surfaces.
