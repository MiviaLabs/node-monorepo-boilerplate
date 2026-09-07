# 🏗️ Architecture

> Grounded in `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, and the
> package sources — not aspirational design notes.

## 🌐 System context

```mermaid
flowchart TB
    subgraph apps[🧑‍💻 Applications]
        API[🛠️ apps/api · NestJS]
        WEB[🌐 apps/web · Next.js]
        ADM[🧭 apps/admin · Next.js]
        MOB[📱 apps/mobile · Expo]
    end

    subgraph data[🗄️ Data & messaging]
        PG[(PostgreSQL<br/>db-core schema)]
        OUT[(outbox table<br/>db-outbox schema)]
        KF[[Kafka topics]]
        RD[(Redis)]
        S3[(S3 / MinIO)]
    end

    subgraph platform[🧰 Platform services]
        OPA{{OPA policies}}
        KMS[🔑 KMS providers<br/>GCP · AWS · Azure · Vault · env-var]
        MAIL[📧 Email providers<br/>Resend · mock]
        TASKS[⏰ Cloud Tasks · BullMQ]
    end

    WEB --> API
    ADM --> API
    API --> PG
    API --> OUT
    OUT --> KF
    API --> RD
    API --> S3
    API -. authz .-> OPA
    API --> KMS
    API --> MAIL
    API --> TASKS
    MOB -. standalone starter .-> MOB
```

- **`apps/api`** — the only writer of domain data. NestJS 12, `@nestjs/cqrs`,
  Drizzle ORM, Passport JWT, `@nestjs/throttler`, `@nestjs/schedule`.
- **`apps/web` / `apps/admin`** — Next.js 16 apps that call the API through
  route handlers (`apps/*/src/app/api/**`) and tRPC routers for server data.
- **`apps/mobile`** — self-contained Expo starter with mocked auth; intended to
  be pointed at the API later.

## 🚦 Request lifecycle

Wired in `AppModule` (`apps/api/src/app.module.ts`) and `main.ts`:

```mermaid
flowchart LR
    req[HTTP request<br/>/api/*] --> mid[Middlewares<br/>LocaleContext · Tenant]
    mid --> guard{APP_GUARDS}
    guard --> tg[TenantGuard<br/>x-tenant-id]
    tg --> jwt[JWT auth]
    jwt --> opa[OPA hybrid policy]
    opa --> throttle[Nested throttlers<br/>per action]
    throttle --> pipe[ValidationPipe]
    pipe --> ctrl[Versioned controller<br/>/api/v1/*]
    ctrl --> bus[CQRS bus]
    bus --> handler[Command / query handler]
    handler --> repo[Repository · Drizzle]
    repo --> tx[(Transaction:<br/>domain rows + outbox row)]
    handler --> res[Interceptors<br/>user context · logging · version]
    res --> out[Response]
```

Cross-cutting pieces:

| Piece            | Where                                       | Notes                                                                                                                                                                       |
| ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global prefix    | `main.ts`                                   | every route mounts under `/api`                                                                                                                                             |
| API versioning   | `@VersionedController('v1', '...')`         | URI versioning; **v1 only** — no v2 routes exist                                                                                                                            |
| Tenant isolation | `TenantMiddleware` + `TenantGuard`          | requires tenant context on protected routes                                                                                                                                 |
| Authorization    | `HybridPolicyGuard` + OPA                   | RBAC + OPA policy decision, shadow/strict modes                                                                                                                             |
| Rate limiting    | `ThrottlerModule`                           | named buckets: `login`, `registration`, `refreshToken`, `oauth`, `phoneLogin`, `validateToken`, `invitationPreview`, `passwordReset`, `bootstrapStatus`, `bootstrapInstall` |
| Error model      | `GlobalExceptionFilter` + `@package/errors` | typed error codes, i18n-ready messages                                                                                                                                      |
| Observability    | `ObservabilityModule`                       | pino logging, OpenTelemetry tracing/metrics                                                                                                                                 |

## 📤 Transactional outbox

`packages/db-outbox` owns the outbox table + NestJS module;
`packages/events` owns the poller, publisher, dead-letter, and replay services.

```mermaid
flowchart TD
    cmd[Command handler] --> tx[(BEGIN)]
    tx --> rows[Write domain rows]
    tx --> evt[Write outbox row<br/>same transaction]
    rows --> commit[COMMIT]
    evt --> commit
    commit --> poll[Outbox poller<br/>OUTBOX_POLL_INTERVAL]
    poll --> pub[Publish to Kafka]
    pub --> ok{Delivered?}
    ok -- yes --> done[Mark published]
    ok -- no --> retry[Retry w/ backoff<br/>OUTBOX_MAX_RETRIES]
    retry --> dlq[Dead-letter queue]
    dlq --> rp[Operator replay<br/>/api/v1/platform/event-replay]
```

Consumers subscribe by topic (Kafka) with per-topic consumer groups; failed
handlers land in the dead-letter queue and can be replayed from the admin
console.

## 🧩 Package layering

```mermaid
flowchart TD
    subgraph apps2[Applications]
        A[apps/*]
    end
    subgraph feature[Feature packages]
        AUTH[auth] --> CORE2[core]
        EVENTS[events] --> CORE2
        EMAILP[email] --> CORE2
        SEC[security helpers]
    end
    subgraph infra2[Infrastructure packages]
        DBC[db-core]
        DBO[db-outbox]
        QUEUES[queues]
        REDIS[redis]
        PUBSUB[pubsub]
        TASKSP[tasks]
        STORAGE[storage]
        ENC[encryption]
        SECRETS[secrets]
        OPA2[opa]
    end
    subgraph base[Foundation packages]
        TYPES[types]
        SCHEMA[schema]
        CONSTS[constants]
        ERRORS[errors]
        UTILS[utils]
        I18N[i18n]
        OBS[observability]
        COREP[core]
        TU[test-utils]
    end
    A --> feature
    A --> infra2
    feature --> infra2
    feature --> base
    infra2 --> base
    EVENTS --> DBO
```

Rules of thumb:

- **foundation** packages depend on nothing internal (types, utils, constants…)
- **infrastructure** packages wrap one external system and depend on foundation
- **feature** packages compose infrastructure (auth, events, email)
- **apps** compose everything and hold the business modules

## 🗂️ API module map

Module class names are domain-renamed; directories keep a stable lowercase
name. Verified in `apps/api/src/app.module.ts`:

| Module class        | Directory                 | Domain                         | Base route                      |
| ------------------- | ------------------------- | ------------------------------ | ------------------------------- |
| `PeopleModule`      | `modules/users`           | people directory & addresses   | `/api/v1/people`                |
| `AuthModule`        | `modules/auth`            | identity, tokens, sessions     | `/api/v1/iam`                   |
| `WorkspacesModule`  | `modules/tenants`         | tenants & memberships          | `/api/v1/workspaces`            |
| `SpacesModule`      | `modules/projects`        | projects                       | `/api/v1/spaces`                |
| `TicketsModule`     | `modules/issues`          | issues                         | `/api/v1/tickets`               |
| `PagesModule`       | `modules/content`         | content pages                  | `/api/v1/pages`                 |
| `SecureVaultModule` | `modules/encrypted-store` | encrypted field storage        | `/api/v1/secure-vault`          |
| `StorageModule`     | `modules/storage`         | object storage                 | `/api/v1/objects`               |
| `ConsoleModule`     | `modules/admin`           | operator console               | `/api/v1/console`               |
| `PlatformModule`    | `modules/system`          | settings, metrics, replay, DLQ | `/api/v1/platform`              |
| `InboundMailModule` | `modules/email-webhooks`  | mail webhook ingestion         | `/api/v1/webhooks/inbound-mail` |
| `OpsHealthModule`   | `modules/health`          | health checks                  | `/api/v1/ops/health`            |
| `SetupModule`       | `modules/bootstrap`       | first-run install              | `/api/v1/setup`                 |
| `ApiKeysModule`     | `modules/api-keys`        | API key schema & repository    | — (no HTTP surface)             |
| `SecurityModule`    | `modules/security`        | security monitoring            | — (guards/services)             |
| email module        | `modules/email`           | outbound email send            | `/api/v1/messaging`             |

Feature folders inside each module follow the same shape:
`commands/ · queries/ · handlers/ · controllers/ · repositories/ · dto/ ·
events/ · jobs/ · consumers/ · __tests__/`.
