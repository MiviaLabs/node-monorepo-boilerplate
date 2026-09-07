# ⚙️ Operations

Local infrastructure, runtime flags, observability, security scans, and CI.

## 🐳 Local stack (`docker-compose.dev.yml`)

```bash
pnpm dev:start     # up      pnpm dev:ps       # status
pnpm dev:health    # wait    pnpm dev:logs     # follow
pnpm dev:restart   # bounce  pnpm dev:stop     # down
pnpm dev:clean     # down -v (⚠️ wipes volumes)
```

| Service                                                 | Address                       | Notes                               |
| ------------------------------------------------------- | ----------------------------- | ----------------------------------- |
| PostgreSQL                                              | `localhost:5432`              | `pnpm postgres-cli`                 |
| Redis                                                   | `localhost:6379`              | `pnpm redis-cli`                    |
| OPA                                                     | `http://localhost:8181`       | policies in `packages/opa/policies` |
| Kafka / Zookeeper                                       | `:9092` / `:2181`             | used when `EVENTS_ENABLED=true`     |
| MinIO                                                   | `:9000` API · `:9001` console | S3-compatible storage               |
| MailHog                                                 | `:8025` UI                    | catches outbound email in dev       |
| PgAdmin (profile `admin`)                               | `:5050`                       | `pnpm dev:admin:docker`             |
| Jaeger / Prometheus / Grafana (profile `observability`) | `:16686` / `:9090` / `:3030`  | OTel pipelines                      |

## 🎛️ Runtime feature flags (API)

Read in `apps/api/src/app.module.ts`:

| Flag                                                                                          | Default           | Effect                                                                        |
| --------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `EVENTS_ENABLED`                                                                              | `false`           | Kafka + outbox wiring; when off, no Kafka connections are made                |
| `OUTBOX_ENABLED`                                                                              | `true`            | outbox poller/publisher                                                       |
| `OUTBOX_POLL_INTERVAL` / `OUTBOX_BATCH_SIZE` / `OUTBOX_MAX_RETRIES` / `OUTBOX_RETENTION_DAYS` | 1000 / 10 / 5 / 7 | outbox tuning                                                                 |
| `OPA_ENABLED`                                                                                 | `true`            | OPA policy authorization module                                               |
| `SCHEDULER_ENABLED`                                                                           | `true`            | `@nestjs/schedule` cron jobs                                                  |
| `THROTTLE_ENABLED`                                                                            | `true`            | named rate-limit buckets                                                      |
| `REDIS_ENABLED`                                                                               | `false`           | distributed throttler storage                                                 |
| `ENCRYPTION_PROVIDER`                                                                         | —                 | force `env-var` provider (tests/default dev); otherwise KMS resolved from env |
| `ENCRYPTION_KEY`, `ENCRYPTION_KEY_<keyId>`                                                    | —                 | env-var KMS keys (tenant key per id)                                          |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                                                                 | —                 | enables OTLP export                                                           |

Kafka tuning: `KAFKA_BROKERS`, `KAFKA_SSL`, `KAFKA_SASL_*`,
`KAFKA_PRODUCER_*`, `KAFKA_CONSUMER_*`.

## 📈 Observability

- **Logs**: pino (`SERVICE_NAME`, pretty in dev via `pino-pretty`).
- **Tracing/metrics**: OpenTelemetry auto-instrumentations; export when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- **Health**: `GET /api/v1/ops/health` aggregates database, redis, outbox, and
  encryption indicators.
- **GCP providers** in `packages/observability` for cloud deployments.

## 🔐 Security & static analysis

```bash
pnpm analyze:all          # everything below
pnpm scan:secrets:trufflehog   # secret scanning
pnpm scan:iac:checkov          # IaC scanning (.checkov.yaml)
pnpm lint:workflows           # actionlint
pnpm lint:shell               # shellcheck
pnpm lint:dockerfiles         # hadolint
pnpm audit                    # dependency audit (high+)
pnpm sbom:validate            # SBOM tooling
```

`.trufflehog.yaml` excludes fixtures/docs/lockfiles; there is **no allowlist**
of historical findings — history is a single commit by design.

## 🤖 CI (`.github/workflows`)

| Workflow                   | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `ci.yml`                   | install → lint → typecheck → unit tests → audits |
| `ci-e2e-tests.yml`         | e2e suites with services                         |
| `static-analysis.yml`      | shell/docker/workflow linting                    |
| `security.yml`             | secret & IaC scanning                            |
| `pr-title.yml`             | commitlint-style PR title check                  |
| `release.yml` · `sign.yml` | release & artifact signing                       |

## 🚢 Docker images

Each deployable app has a Dockerfile (`apps/api`, `apps/web`, `apps/admin`) +
`entrypoint.sh` and compose files (`docker-compose.api.yml`,
`docker-compose.web.yml`). The API image resolves pino worker paths at runtime
(see `apps/api/src/main.ts`) and runs migrations via
`apps/api/src/common/database/migration.config.ts` before serving, depending on
env.

## 🧰 Docs generation

```bash
pnpm docs:generate   # ER diagram, module deps, OpenAPI, package deps, typedoc, metadata
pnpm nx graph        # interactive project graph
```

Outputs land in `.agents/docs/reference/` and are safe to regenerate at any
time.
