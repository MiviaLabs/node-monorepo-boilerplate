# @package/db-core

Main database schema definitions using Drizzle ORM for PostgreSQL with enterprise multi-tenancy, encryption support, and programmatic migration management.

## Purpose

The `@package/db-core` package provides the primary relational data persistence layer for platform services:

- **Complete Schema Definitions**: Drizzle ORM definitions for core domain entities (identity, organizations, tenancy, role-based access, issues, content management, auditing, and credentials).
- **Multi-Tenant Isolation**: Strict tenant isolation across all shared-database entities.
- **Envelope Encryption Hooks**: Seamless integration with `@package/encryption` for Class-C encrypted encrypted-store entries and user identity hashes.
- **Connection Lifecycle**: Lazy-initialized connection pooling with transaction helper types.
- **Migration & Seeding Tooling**: Isolated migration tracking schema (`drizzle.__drizzle_migrations_main`) and environment-specific seeding datasets.

## Structure

```text
src/
├── schemas/                         # Drizzle table definitions
│   ├── api-keys.schema.ts           # Service and user API keys
│   ├── content-attachments.schema.ts# Content attachments and binary references
│   ├── content-comments.schema.ts   # Comments on content entries
│   ├── content-entries.schema.ts    # CMS and documentation content
│   ├── email-messages.schema.ts     # Email transaction logs
│   ├── email-provider-messages.schema.ts
│   ├── email-webhook-events.schema.ts
│   ├── files.schema.ts              # File metadata and storage pointers
│   ├── invitations.schema.ts        # Tenant invitation workflows
│   ├── issue-activity.schema.ts     # Audit timeline for issues
│   ├── issue-assignees.schema.ts    # User issue assignments
│   ├── issue-attachments.schema.ts  # Issue file attachments
│   ├── issue-comments.schema.ts     # Issue discussions
│   ├── issue-labels.schema.ts       # Issue tag taxonomy
│   ├── issue-label-assignments.schema.ts
│   ├── issue-relations.schema.ts    # Dependency graph links
│   ├── issue-watchers.schema.ts     # Notification subscribers
│   ├── issues.schema.ts             # Project tracking issues
│   ├── key-rotation-state.schema.ts # KMS and DEK rotation tracking
│   ├── kms-rotation-checkpoint.schema.ts
│   ├── organizations.schema.ts      # Top-level customer accounts
│   ├── password-reset-tokens.schema.ts
│   ├── project-members.schema.ts    # Project collaborator bindings
│   ├── projects.schema.ts           # Scoped project spaces
│   ├── tenants.schema.ts            # Partitioned tenant environments
│   ├── user-addresses.schema.ts     # Contact and billing addresses
│   ├── user-identities.schema.ts    # OAuth / OIDC federated identities
│   ├── user-organization-settings.schema.ts
│   ├── user-roles.schema.ts         # RBAC role bindings
│   ├── user-tenants.schema.ts       # User-to-tenant memberships
│   ├── users.schema.ts              # User profiles and authentication
│   ├── encrypted-store-entries.schema.ts      # Envelope-encrypted secrets storage
│   └── index.ts                     # Schema barrel export
├── migrations/                      # Migration management
│   ├── cli.ts                       # CLI runner
│   ├── constants.ts                 # Migration constants and table identifiers
│   └── runner.ts                    # Programmatic runner
├── seed/                            # Seeding infrastructure
│   ├── datasets/                    # Static seed datasets (dev, test)
│   ├── factories/                   # Dynamic entity generators
│   └── seed-runner.ts               # Dataset runner
├── db.ts                            # Connection pool and Drizzle client proxy
├── schema.ts                        # Unified schema export
└── index.ts                         # Package public API
```

## Usage

```typescript
import { db, users, organizations, eq, and } from '@package/db-core';

// Tenant-scoped querying
const user = await db.query.users.findFirst({
  where: and(
    eq(users.id, 'usr_12345'),
    eq(users.organizationId, 'org_001')
  )
});

// Atomic multi-table transactions
await db.transaction(async (tx) => {
  const [org] = await tx
    .insert(organizations)
    .values({ name: 'Acme Corp', slug: 'acme-corp' })
    .returning();

  await tx.insert(users).values({
    organizationId: org.id,
    emailHash: 'hash_val',
    status: 'active'
  });
});
```

### Running Migrations

```typescript
import { runMigrations } from '@package/db-core';

// Run pending migrations
await runMigrations(process.env.DATABASE_URL);
```

## Key Exports

### Schema Tables & Entities
- Core Identity: `users`, `organizations`, `tenants`, `userTenants`, `userRoles`, `userIdentities`
- Security & Secrets: `apiKeys`, `encryptedStoreEntries`, `keyRotationState`, `kmsRotationCheckpoint`
- Workspaces & Tracking: `projects`, `projectMembers`, `issues`, `issueComments`, `issueLabels`
- Content & Assets: `contentEntries`, `files`, `contentAttachments`
- Communications: `emailMessages`, `emailProviderMessages`, `emailWebhookEvents`

### Connection Utilities
- `db`: Lazy-initialized Drizzle ORM client proxy.
- `getPool()`: Direct access to underlying PostgreSQL `pg.Pool`.
- `resetPool()`: Teardown pool connections between tests.
- `DbType<T>`: Helper type representing active client or transaction context.

### Migration Management
- `runMigrations(databaseUrl)`: Programmatic migration runner.
- `MIGRATIONS_TABLE`: Migration tracking table (`__drizzle_migrations_main`).
- `MIGRATIONS_SCHEMA`: Schema namespace (`drizzle`).

## Development Commands

```bash
# Build package
pnpm nx build db-core

# Run unit tests
pnpm nx test db-core

# Run migrations CLI
pnpm run db-core:migrate

# Seed database
pnpm run seed:dev
```

## Associated Packages

- [`@package/encryption`](../encryption) – Field-level encryption for `encrypted-store_entries` and sensitive attributes.
- [`@package/db-outbox`](../db-outbox) – Transactional outbox event store schema.
- [`@package/types`](../types) – Entity and CQRS interfaces.
