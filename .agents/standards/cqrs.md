# CQRS and domain-flow standard

## Applies to

NestJS CQRS handlers and event-driven work using `@nestjs/cqrs`, repository packages, outbox/event packages, queues, and transactional database code.

## Required behavior

- A command changes state or causes a side effect; a query reads state; an event describes a completed domain fact. Keep those responsibilities separate.
- Carry tenant and actor context in every command, query, event, job, and repository call where the domain requires it.
- Keep commands and queries immutable and small. Handlers orchestrate domain work; they should not become unbounded utility classes.
- Keep reads side-effect free. Do not publish events, mutate caches, or write audit records from a query unless the contract explicitly defines that behavior.
- Put invariant enforcement near the domain/application boundary, before persistence. Re-check authorization and tenant scope in the repository path.
- Use transactions for coupled writes. Publish integration effects through the established outbox/event path so a committed state cannot silently lose its event.
- Make event handlers idempotent, observable, and safe to retry. Include stable identifiers and correlation context.
- Return the repository’s established result/error types rather than inventing a handler-local envelope.

## Do not

- Do not call a command from a query or hide writes inside a read helper.
- Do not emit an event before the transaction can guarantee the corresponding state.
- Do not bypass repositories with unscoped table access.
- Do not treat event delivery as exactly once unless the transport and code prove it.

## Verification

Test handler decisions in isolation, transaction/outbox behavior at integration level, and authorization/tenant behavior through API E2E where exposed.
