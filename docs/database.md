# 🗄️ Database

PostgreSQL via **Drizzle ORM**. Schemas live in `packages/db-core/src/schemas`,
the outbox table in `packages/db-outbox/src/schema`. Migrations are plain SQL
under `packages/*/drizzle/` applied by `drizzle-kit`.

> 📌 One known quirk: the `encrypted-store_entries` table intentionally uses a
> hyphenated name (it is quoted in SQL everywhere). All FK/index references
> match it exactly.

## 🧱 Tables (db-core, 32)

| Group                 | Tables                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 👥 Identity & tenancy | `users`, `user_identities`, `user_roles`, `user_tenants`, `user_organization_settings`, `organizations`, `tenants`, `invitations`, `password_reset_tokens`                                          |
| 🗂️ Work               | `projects`, `project_members`, `issues`, `issue_comments`, `issue_assignees`, `issue_attachments`, `issue_activity`, `issue_labels`, `issue_label_assignments`, `issue_relations`, `issue_watchers` |
| 📄 Content            | `content_entries`, `content_comments`, `content_attachments`                                                                                                                                        |
| 🏠 PII                | `user_addresses` (encrypted street/city/state/postal/country via `encrypted-store_entries` FKs), `encrypted-store_entries`                                                                          |
| 📬 Mail & files       | `email_messages`, `email_provider_messages`, `email_webhook_events`, `files`                                                                                                                        |
| 🔐 Ops                | `api_keys`, `key_rotation_state`, `kms_rotation_checkpoint`                                                                                                                                         |

Plus **`outbox`** in `db-outbox` (event id, type, payload, aggregate,
correlation, status, attempts, timestamps).

## 🔁 Migration workflow

```bash
# 1. edit schemas in packages/db-core/src/schemas/*.schema.ts
pnpm db:generate        # generate SQL migration (drizzle-kit)
#    review the generated SQL in packages/db-core/drizzle/
pnpm db:migrate         # apply locally
pnpm db:studio          # browse data (drizzle-kit studio)

# outbox schema has its own workflow
pnpm db-outbox:generate
pnpm db-outbox:migrate
```

- `packages/db-core/drizzle/meta/_journal.json` tracks applied migrations in
  `__drizzle_migrations_main`; the outbox keeps its own journal.
- `pnpm dev:reset-db` drops and recreates the local database (then re-run
  `pnpm db:migrate`).
- `scripts/db/migrate.ts` wraps per-package migrate/push/generate/studio:
  `pnpm exec tsx scripts/db/migrate.ts db-core push`.

## 🌱 Seeding

`packages/db-core/src/seed` contains factories (user, organization) and
datasets:

```bash
pnpm dev:seed                                    # default dataset
npx tsx packages/db-core/src/seed/seed-runner.ts # direct run
```

Datasets: `development.dataset.ts`, `testing.dataset.ts`.

## 🏷️ Conventions

- snake_case table & column names; primary key `id`; `organization_id`
  tenant column on tenant-owned tables.
- Soft deletes where business flows need history (`deleted_at`), purge jobs
  clean up later.
- PII columns are never stored inline — addresses reference
  `encrypted-store_entries` rows; the columns hold
  `*_encrypted_store_id` FKs with `ON DELETE RESTRICT`.
- Schema unit tests live next to schemas
  (`src/schemas/__tests__/*.unit.test.ts`) and run without a database;
  `*.integration.test.ts` variants spin up Testcontainers PostgreSQL.
