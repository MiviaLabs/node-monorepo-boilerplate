---
name: api-storage-file-lifecycle
description: Safely evolve the shared file lifecycle, storage routing, uploads, deletion, purge, and tenant-safe domain links.
---

# API storage file lifecycle

## Scope

Applies across `packages/storage`, `packages/db-core`, and
`apps/api/src/modules/storage` for file metadata, domain attachments, uploads,
downloads, deletion, purge, and recovery.

## When to use

Use for any change that can alter the physical object, its central `files` row,
domain ownership, transport contract, or cleanup behavior.

## Inspect first

- `packages/storage`
- `packages/db-core/src/schemas/files.schema.ts`
- `packages/db-core/src/schemas/index.ts`
- `apps/api/src/modules/storage`
- `apps/api/src/modules/auth/handlers/commands/update-my-avatar.handler.ts`
- `apps/api/src/modules/issues/repositories/issue-attachment.repository.ts`
- `apps/api/src/modules/content/repositories/content-attachment.repository.ts`
- `.agents/governance/backend-standards.md`
- `.agents/memories/lessons-learned.yaml`

## Required behavior

- Keep `files` as the canonical physical-object registry and persist
  `storage_instance`, `bucket`, and `object_key` on each row.
- Model ownership as a central file row followed by concrete domain foreign keys.
- For `db-core`, edit `packages/db-core/src/schemas/*.schema.ts` first, export
  through `index.ts` when needed, run `pnpm db:generate`, and review the SQL.
- Keep controllers thin and route writes through CQRS handlers.
- Carry tenant scope explicitly through repositories and attachment checks.
- Decide audit behavior for reservation, completion, signed download, delete,
  purge, and recovery jobs.
- Choose upload transport explicitly; default new flows to `api_proxy`, keep
  `presigned` additive, and document streaming/multipart/presign semantics.
- On API-proxy uploads, validate content type/length, serialize or make retries
  idempotent, and clean partial provider objects on failure.
- Treat non-resumable streaming as a bounded phase:

- do not describe it as distributed-safe for large files without explicit multi-instance validation
- add multipart or resumable support additively instead of overloading the simple path

## Repository-specific rules

- Do not introduce a polymorphic `owner_type` / `owner_id` file ownership model for normal domain linkage.
- Do not infer historical bucket placement from current config alone; persist it on the file row.
- Prefer additive rollout paths before removing legacy attachment metadata.
- Keep generic direct file reads or deletes narrowly authorized. If collaborative access is needed, add domain-aware endpoints instead of widening generic file access casually.
- Keep delete and purge flows idempotent so retries and scheduler startup races are safe.
- Detect and reconcile stale `pending_upload` rows explicitly instead of leaving silent orphan state.
- Avoid exposing raw storage routing fields in broader public DTOs unless the client is trusted and that exposure is intentional.
- Do not treat a new upload transport as complete with unit tests alone when the change crosses controller, CQRS, persistence, and provider boundaries.

## Verification

- Test lifecycle transitions, tenant/owner checks, and failure paths.
- Add integration coverage for material schema or persistence changes.
- Add real API E2E for transport, response wrapping, or streaming changes.
- Prove retry/idempotency behavior for schedulers and queues.

## Exclusions

Do not introduce polymorphic `owner_type`/`owner_id` linkage, infer historical
bucket placement from current config, expose raw routing fields broadly, widen
generic file access, or call API streaming distributed-safe for large files
without multi-instance validation.
