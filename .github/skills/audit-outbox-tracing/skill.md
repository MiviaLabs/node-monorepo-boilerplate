---
name: audit-outbox-tracing
description: Preserve transactional audit/outbox decisions and request tracing across API write flows.
---

# Audit, outbox, and tracing

## Scope

Applies to API writes and sensitive reads that may produce audit or domain
events, especially controller-to-handler-to-outbox paths.

## When to use

Activate when a change adds, removes, reshapes, or moves an event or any of
`requestId`, `correlationId`, or `causationId`.

## Inspect first

- `apps/api/docs/events/outbox-pattern.md`
- `.agents/memories/lessons-learned.yaml`
- `apps/api/src/common/events/audit-outbox.publisher.ts`
- `apps/api/src/common/interceptors/logging.interceptor.ts`
- `apps/api/src/modules/auth/handlers/commands/update-my-profile.handler.ts`

## Required behavior

- Decide explicitly: domain event, audit event, both, or neither.
- Keep state changes and outbox inserts in one transaction whenever one business operation must be observed atomically; record why when no event is required.
- Preserve `requestId`, `correlationId`, and `causationId` across every boundary.
- Keep audit payloads metadata-only and free of PII and secrets.
- Treat audited hot reads as exceptions: record the reason, payload shape, and
  expected repetition frequency.

## Verification

- Confirm critical events are not only best-effort post-commit effects.
- Review every sensitive read and write for an explicit audit decision.
- Check that one higher-level read action does not emit repeated helper-level audits.

## Exclusions

Do not log secrets/PII, drop trace identifiers, or add audit fan-out to a hot
path without a written budget and justification.
