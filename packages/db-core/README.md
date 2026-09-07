# @package/db-core

Enterprise PostgreSQL database schema definitions, relations, and migration tools powered by Drizzle ORM.

## Overview

`@package/db-core` is the primary relational database layer for the platform monorepo. It manages strongly typed schema declarations, database migrations, connection pooling, and seeding fixtures using Drizzle ORM on PostgreSQL. Designed for multi-tenant SaaS environments, it provides strict tenant isolation, envelope encryption support for sensitive credentials, and complete entity modeling for identity, organizational hierarchy, project management, and communications.

## Key Features

- **Full Drizzle ORM Schema**: Comprehensive tables and relations covering identity, access control, organizations, projects, issue tracking, content storage, and email delivery.
- **Tenant Isolation**: Native multi-tenant isolation patterns across shared database schemas.
- **Sensitive Data Security**: Seamless integration with `@package/encryption` for Class-C encrypted encrypted store entries and blind indexes.
- **Connection Management**: Resilient connection pooling with lazy initialization and transaction-safe database client abstractions (`DbType<T>`).
- **Programmatic & CLI Migrations**: Version-controlled Drizzle migrations isolated within a dedicated schema (`drizzle.__drizzle_migrations_main`).
- **Environment Seeding**: Test and development dataset fixtures and factory generators.

## Installation

```bash
pnpm add @package/db-core
```

## Quick Start

```typescript
import { db, users, organizations, eq, and } from '@package/db-core';

// Tenant-scoped query
const activeUser = await db.query.users.findFirst({
  where: and(
    eq(users.id, 'usr_1001'),
    eq(users.organizationId, 'org_main')
  ),
  with: {
    userTenants: true,
    userRoles: true
  }
});

// Transactional multi-entity writes
await db.transaction(async (tx) => {
  const [org] = await tx
    .insert(organizations)
    .values({
      name: 'Acme Corporation',
      slug: 'acme-corp'
    })
    .returning();

  await tx.insert(users).values({
    organizationId: org.id,
    emailHash: 'hash_abc123',
    status: 'active'
  });
});
```

## Entity Schema Architecture

The package exports schema tables, relations, and type definitions across multiple core domains:

### 1. Identity & Multi-Tenancy
- `organizations`: Root enterprise customer entities.
- `tenants`: Isolated workspaces and security boundaries within organizations.
- `users`: User profile records, status, and authentication credentials.
- `userTenants`: User-to-tenant memberships and tenant-scoped statuses.
- `userRoles`: Role-based access control assignments with temporal expiration support.
- `userIdentities`: Federated third-party OAuth/OIDC accounts (Google, Keycloak, etc.).
- `invitations`: Workspace and tenant member invitations.
- `passwordResetTokens`: Single-use credential recovery tokens.

### 2. Security & Credentials
- `apiKeys`: Hashed and partitioned API credentials for automated service access.
- `encryptedStoreEntries`: Envelope-encrypted Class-C secrets (credentials, private tokens, webhook signing secrets).
- `keyRotationState`: Key management service (KMS) and data encryption key (DEK) lifecycle tracking.
- `kmsRotationCheckpoint`: Checkpoints for large-scale cryptographic re-encryption batches.

### 3. Workspaces & Issue Tracking
- `projects`: Isolated issue tracking spaces.
- `projectMembers`: Collaborators assigned to projects with role privileges.
- `issues`: Work items, bug reports, and tasks.
- `issueAssignees`: Assignees mapped to specific issues.
- `issueComments`: Threaded communication and discussions.
- `issueLabels`: Tag taxonomies and categorizations.
- `issueLabelAssignments`: Issue-to-label associations.
- `issueRelations`: Issue dependencies, blockers, and duplicates.
- `issueWatchers`: Notification subscriber registrations.
- `issueActivity`: Immutable audit trails and modification logs.

### 4. Content & Asset Management
- `contentEntries`: Structured CMS and documentation documents.
- `contentComments`: Feedback and annotations on content.
- `contentAttachments`: Assets and attachments tied to content entries.
- `files`: File metadata and blob pointers for asset storage.

### 5. Email & Communication Records
- `emailMessages`: Outbound transactional email records and statuses.
- `emailProviderMessages`: Upstream provider message identifiers and dispatch logs.
- `emailWebhookEvents`: Ingested delivery, bounce, and open webhook events.

## Database Connection & Utilities

```typescript
import { db, getPool, resetPool } from '@package/db-core';

// Direct query using Drizzle client proxy
const allOrgs = await db.select().from(organizations);

// Direct pg pool access (for raw queries or custom pooling configuration)
const pool = getPool();

// Teardown connections during test execution
await resetPool();
```

## Migrations

### CLI Migration Execution

```bash
pnpm run db-core:migrate
```

### Programmatic Migration Execution

Used during CI/CD pipelines, integration testing, and container initialization:

```typescript
import { runMigrations } from '@package/db-core';

await runMigrations(process.env.DATABASE_URL);
```

### Generating Schema Migrations

```bash
# Generate SQL migration files from updated schema definitions
pnpm db:generate db-core
```

## Database Seeding

The package includes dataset runners and factories for development and testing environments:

```bash
# Seed development dataset
pnpm run seed:dev

# Seed automated testing dataset
pnpm run seed:test
```

Programmatic seeding usage:

```typescript
import { db, SeedRunner, developmentDataset } from '@package/db-core';

const runner = new SeedRunner(db, developmentDataset);
await runner.run();
```

## Environment Variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `DATABASE_URL` | Yes | PostgreSQL connection URI |
| `ENVIRONMENT` | No | Target environment name (`development`, `test`, `production`) |

## Development Commands

```bash
# Build package
pnpm nx build db-core

# Run unit tests
pnpm nx test db-core

# Lint package
pnpm nx lint db-core
```

## Associated Packages

- [`@package/encryption`](../encryption) – Client-side and envelope encryption for sensitive database columns.
- [`@package/db-outbox`](../db-outbox) – Outbox transactional event store.
- [`@package/types`](../types) – Entity and domain type contracts.
- [`@package/constants`](../constants) – Lifecycle statuses, permissions, and system roles.
