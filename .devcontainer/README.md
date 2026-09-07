# DevContainer

This directory contains the development container configuration for the
MiviaLabs monorepo. The devcontainer provides a reproducible environment
with all required tools pre-installed.

## Supported Environments

- GitHub Codespaces
- VS Code Remote Containers
- Docker Compose (local)

## Multi-Container Layout

The devcontainer runs a Docker Compose stack with:

| Service     | Image                         | Ports          | Purpose                       |
| ----------- | ----------------------------- | -------------- | ----------------------------- |
| app         | Custom Dockerfile            | -              | Main development container    |
| postgres    | pgvector:0.8.0-pg18           | 5432           | PostgreSQL with vector support|
| redis       | redis:8.0.2-alpine            | 6379           | Cache and session store       |
| rabbitmq    | rabbitmq:4.0.5-management     | 5672, 15672    | Message broker with UI        |
| minio       | minio/minio:2024-11-07        | 9000, 9001     | S3-compatible object storage  |
| mailpit     | axllent/mailpit:v1.21         | 1025, 8025     | Local SMTP testing tool       |

The app service uses `network_mode: host` so all services are reachable on
`localhost`. This is required for GitHub Copilot agent connectivity.

## Pre-Installed Tooling

### Runtime

- Node.js 24
- pnpm 10.29.3
- Python 3 (with pip, venv, pipx)
- Docker-in-Docker

### Security and Static Analysis

- Semgrep
- Checkov
- TruffleHog3
- Shellcheck
- Actionlint
- Hadolint
- OPA (Open Policy Agent)

### Database Clients

- postgresql-client (`psql`)
- redis-tools (`redis-cli`)
- GitHub CLI (`gh`)

### AI Assistants

- CodeQL CLI
- Claude Code CLI

## Lifecycle Hooks

The devcontainer uses three lifecycle commands to minimize startup cost:

1. **`onCreateCommand`** — runs once when the container is first built.
   `pnpm fetch --frozen-lockfile` downloads packages to the pnpm store.
2. **`postCreateCommand`** — runs after creation. `pnpm install --frozen-lockfile --offline --prefer-offline`
   installs from the cached store.
3. **`postStartCommand`** — runs on every container start. Displays a welcome
   message and runs `pnpm run dev:health` to verify service health.

A workspace setup script (`.devcontainer/scripts/setup-workspace.sh`) is
also run during `postCreateCommand` to:

- Verify pnpm is configured
- Remove any npm artifacts left in individual packages
- Validate `.npmrc` and `pnpm-workspace.yaml`
- Configure git user settings if unset
- Verify Husky hooks are initialized
- Confirm required dev tools are available

## Usage

### GitHub Codespaces

1. Click **Code** → **Create codespace on [branch]**
2. Wait for the container build (~3-5 minutes first time)
3. VS Code for Web opens with all tools ready

### VS Code Remote Containers

1. Install the **Dev Containers** extension
2. Run **Dev Containers: Reopen in Container** from the command palette
3. Wait for the build to finish
4. Start coding

### Local Docker Compose

```bash
docker compose -f .devcontainer/docker-compose.yml up -d
docker compose -f .devcontainer/docker-compose.yml ps
docker compose -f .devcontainer/docker-compose.yml down
```

## Development Workflow

After the devcontainer is ready:

```bash
# Start all infra services
pnpm dev:start

# Start the API server (in one terminal)
pnpm dev:api

# Start the Web app (in another terminal)
pnpm dev:web
```

### Tests

```bash
pnpm test:api:unit        # Unit tests
pnpm test:api:e2e        # End-to-end tests
pnpm test:api            # All API tests
```

### Database

```bash
pnpm db:generate    # Generate migration
pnpm db:migrate     # Apply migrations
pnpm db:studio      # Open Drizzle Studio
pnpm postgres-cli   # psql shell
```

### Security Scanning

```bash
semgrep scan --config tools/semgrep/security.yml --config tools/semgrep/documentation.yml
pnpm scan:secrets:trufflehog
pnpm lint:workflows
pnpm lint:shell
pnpm lint:dockerfiles
pnpm analyze:security
```

## Service Access

| Service        | URL                     | Credentials                 |
| -------------- | ----------------------- | --------------------------- |
| PostgreSQL   | `localhost:5432`        | `starter` / `starter_dev`   |
| Redis        | `localhost:6379`        | No auth                     |
| RabbitMQ AMQP | `localhost:5672`        | `guest` / `guest`           |
| RabbitMQ UI   | http://localhost:15672  | `guest` / `guest`           |
| MinIO API     | http://localhost:9000   | `minioadmin` / `minioadmin` |
| MinIO Console | http://localhost:9001   | `minioadmin` / `minioadmin` |
| Mailpit UI    | http://localhost:8025   | No auth                     |
| API Server    | http://localhost:3001   | (after `pnpm dev:api`)      |
| Web App       | http://localhost:3000   | (after `pnpm dev:web`)      |

## Troubleshooting

### Slow `pnpm install`

Lifecycle hooks are tuned to install from the pnpm store cache. If installs
are still slow, confirm the volume mounts for `node_modules` and
`pnpm_store` are present in `.devcontainer/docker-compose.yml`.

### Port conflicts

Host network mode means services bind to host ports. Check for conflicts
with `lsof -i :<port>` and stop the conflicting host process before
starting the devcontainer.

### Missing tools

If a tool is missing inside the container, run
`bash .devcontainer/scripts/setup-workspace.sh` from the repo root to
re-validate the workspace.

## Customization

### Add a system tool

Edit `.devcontainer/Dockerfile`:

```dockerfile
RUN apt-get update && apt-get install -y \
    your-package-here \
    && rm -rf /var/lib/apt/lists/*
```

### Add a VS Code extension

Edit `.devcontainer/devcontainer.json`:

```json
{
  "customizations": {
    "vscode": {
      "extensions": ["publisher.extension-id"]
    }
  }
}
```

### Bump a service version

Edit `.devcontainer/docker-compose.yml` and rebuild the container.

## References

- [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers)
- [Development Containers Specification](https://containers.dev)
- [pnpm Docker Best Practices](https://pnpm.io/docker)