# 🔌 API guide (v1)

> Route catalog extracted from the `@VersionedController(...)` decorators in
> `apps/api/src`. The API is **v1-only** — there are no v2 routes.

## 🌍 Basics

| Thing                | Value                                  |
| -------------------- | -------------------------------------- |
| Base URL (dev)       | `http://localhost:3000`                |
| Global prefix        | `/api`                                 |
| Versioning           | URI segment (`/api/v1/...`)            |
| OpenAPI (Swagger UI) | `http://localhost:3000/api/docs`       |
| OpenAPI (Redoc)      | `http://localhost:3000/api/docs/redoc` |
| OpenAPI JSON         | `http://localhost:3000/api/docs-json`  |

## 🔑 Authentication & tenant headers

- **JWT bearer** — `Authorization: Bearer <token>` for protected routes.
- **Tenant context** — protected routes require the tenant header
  (`x-tenant-id`), enforced by `TenantMiddleware` + `TenantGuard`.
- **API keys** — `ApiKeysModule` provides the `api_keys` table & repository for
  machine access patterns.
- Public routes (login, registration, health, docs assets) opt out via the
  `@Public()`-style decorators.

## 🪣 Rate limiting

Named throttler buckets are configured per action (defaults in
`app.module.ts`):

| Bucket              | Default limit | Window |
| ------------------- | ------------- | ------ |
| `login`             | 5             | 900 s  |
| `registration`      | 3             | 3600 s |
| `refreshToken`      | 10            | 300 s  |
| `oauth`             | 10            | 300 s  |
| `phoneLogin`        | 5             | 900 s  |
| `validateToken`     | 100           | 60 s   |
| `invitationPreview` | 20            | 60 s   |
| `passwordReset`     | 3             | 3600 s |
| `bootstrapStatus`   | 30            | 60 s   |
| `bootstrapInstall`  | 5             | 3600 s |

Disable with `THROTTLE_ENABLED=false`; use Redis-backed storage with
`REDIS_ENABLED=true` for distributed limits.

## 🗺️ Route catalog

| Base path (`/api/v1`)         | Controller                            | Domain                                                                   |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `setup`                       | `bootstrap.controller`                | 🍼 first-run install & status                                            |
| `iam`                         | `auth.controller`                     | 🔐 login, register, refresh, OAuth, phone login, sessions                |
| `iam/credentials`             | `password-reset.controller`           | 🔁 password reset request/confirm                                        |
| `iam/account`                 | `account.controller`                  | 👤 profile, avatar, settings, data export, account deletion              |
| `iam` (test)                  | `auth-test.controller`                | 🧪 dev-only auth test surface                                            |
| `people`                      | `users.controller`                    | 👥 people directory CRUD                                                 |
| `people/addresses`            | `user-addresses.controller`           | 🏠 own address book (encrypted PII fields)                               |
| `people/:userId/addresses`    | `user-addresses.controller`           | 🏠 addresses of a managed person                                         |
| `people/address-key-rotation` | `address-key-rotation.controller`     | 🔄 KMS rotation for address PII                                          |
| `workspaces`                  | `tenants.controller`                  | 🏢 tenants, members, invitations                                         |
| `spaces`                      | `projects.controller`                 | 🗂️ projects & project members                                            |
| `tickets`                     | `issues.controller`                   | 🎫 issues, comments, labels, assignees, watchers                         |
| `pages`                       | `content.controller`                  | 📄 content entries, comments, attachments                                |
| `objects`                     | `storage.controller`                  | 🗄️ file upload/download lifecycle                                        |
| `secure-vault`                | `encrypted-store.controller`          | 🔒 encrypted field storage entries                                       |
| `messaging`                   | `email.controller`                    | 📧 outbound email send                                                   |
| `webhooks/inbound-mail`       | `email-webhooks.controller`           | 📥 provider webhook ingestion                                            |
| `console`                     | `admin.controller`                    | 🧭 operator overview queries (users, tenants, emails, outbox, deletions) |
| `console/queues/dead-letters` | `dead-letter.controller`              | ☠️ DLQ inspection & replay                                               |
| `console/inbound-mail`        | `email-webhook-operations.controller` | 📬 mail event reprocessing                                               |
| `platform`                    | `system.controller`                   | 🛠️ settings, metrics, tenant admin                                       |
| `platform/event-replay`       | `event-replay.controller`             | ⏪ event replay operations                                               |
| `ops/health`                  | `health.controller`                   | 💓 health indicators (db, redis, outbox, encryption)                     |

The root controller (`app.controller.ts`) serves the unversioned `/api` info
endpoint.

## 🚨 Error model

All errors flow through `GlobalExceptionFilter` and use the typed registry in
`packages/errors`:

```jsonc
{
  "errorCode": "USER_001", // stable, i18n-mapped code
  "requestId": "1788…-abcd", // correlation id
  "path": "/api/v1/people/123",
  "method": "GET",
  "message": "Human-readable summary",
  "parameters": { "userId": "123" }
}
```

- Codes follow `<DOMAIN>_<NNN>` (e.g. `AUTH_003`, `VAL_001`, `DB_003`).
- Messages resolve through `ErrorI18nModule` using the request locale
  (`LocaleContextMiddleware`).
- Stack traces and internals never reach the client for server errors.

## 🧭 Conventions for new endpoints

1. Add a controller with `@VersionedController('v1', '<resource>')`.
2. Keep domain wording consistent with the module map in
   [architecture.md](architecture.md#-api-module-map).
3. Put write-side logic in a **command handler**, read-side in a **query
   handler** (`@nestjs/cqrs`).
4. Persist domain rows **and** outbox events in the same transaction when
   other services need to react.
5. Cover the handler with unit tests next to it (`__tests__/*.unit.test.ts`).
