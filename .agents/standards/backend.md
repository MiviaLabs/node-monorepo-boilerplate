# Backend standard

## Applies to

NestJS code in `apps/api` and backend packages such as auth, storage, events, queues, observability, secrets, and database packages.

## Required behavior

- Keep controllers thin: translate HTTP input/output and delegate business work to an application service, command, query, or handler.
- Validate request data at the boundary with the repository’s Zod or Nest validation approach. Do not pass raw request objects into domain or persistence code.
- Preserve the established API versioning, DTO, error, tracing, and response conventions in the owning module.
- Inject dependencies through NestJS. Keep providers focused and expose interfaces where a test or boundary needs substitution.
- Use Drizzle’s typed query builder and the database package’s exported schema/operators. Parameterize raw SQL when it is unavoidable.
- Put transaction boundaries around multi-write operations. Make event publication/outbox behavior part of the same consistency decision.
- Treat retries, queues, webhooks, and scheduled jobs as at-least-once execution: make handlers idempotent and record deduplication where needed.
- Propagate request, actor, tenant, and trace context through service and event boundaries without logging sensitive values.

## Do not

- Do not query a tenant-owned table without an explicit tenant scope.
- Do not put business rules, database queries, or authorization decisions in controllers.
- Do not return database rows as an accidental public API contract.
- Do not create a second database client, migration runner, error hierarchy, or event transport inside an app.

## Verification

Use unit tests for branching logic, integration tests with Testcontainers for database/Redis/Kafka behavior, and API E2E tests for auth, tenant routing, or protected flows. Run the relevant Nx target and authorization gates when applicable.
