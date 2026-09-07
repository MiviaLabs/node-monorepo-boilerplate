# Review standard

## Review order

1. Confirm scope, ownership, and compatibility impact.
2. Check correctness and failure paths.
3. Check security, tenant isolation, data integrity, and privacy.
4. Check tests and whether they prove the changed behavior.
5. Check maintainability, observability, documentation, and generated-surface drift.

## Required questions

- What user or system contract changed?
- Can retries, concurrent requests, partial failure, or stale data break it?
- Can an actor cross tenant or permission boundaries?
- Are errors safe and actionable without exposing sensitive data?
- Does the change require a migration, feature flag, rollback plan, or E2E test?
- Are all changed files in scope, and are generated outputs synchronized through the canonical source?

## Risk levels

- Critical: auth, tenant isolation, secrets, destructive data changes, migrations, or public contract changes. Require focused review and the applicable integration/E2E/security gates.
- High: shared packages, queues/events, persistence, session/proxy behavior, or broad UI state. Require regression coverage and package-level validation.
- Normal: isolated behavior, tests, refactors, or documentation. Require targeted checks and diff review.

## Completion

A review is complete only when required checks are recorded, skipped checks have reasons, residual risks are explicit, and the final diff is limited to the intended change.
