import { Global, Logger, Module, OnModuleInit } from '@nestjs/common';

import { db } from './db';
import { EVENT_STORE_DB } from './outbox-db.constants';
import { runMigrations } from './migrations/runner';

/**
 * NestJS module for the Transactional Outbox Pattern database.
 *
 * Provides the Drizzle ORM database instance for the events database via
 * dependency injection using the {@link EVENT_STORE_DB} token. This module
 * is registered globally, so importing it once in your AppModule makes the
 * database instance available throughout the application.
 *
 * ## What This Module Provides
 *
 * - **EVENT_STORE_DB token**: Inject the Drizzle instance for outbox operations
 * - **Automatic migrations**: Runs migrations in ALL environments by default
 * - **Global registration**: Available in all modules without re-importing
 *
 * ## Connection Management
 *
 * The module uses a lazy-initialized database connection (see {@link db}).
 * The connection is established on first use, not on module initialization.
 * This allows environment variables to be set before the connection is created.
 *
 * ## Automatic Migration Behavior
 *
 * By default, this module automatically runs database migrations on initialization
 * in ALL environments (development, test, production). This ensures the outbox
 * table exists without manual intervention.
 *
 * **To disable auto-migrations** (e.g., in production with CI/CD migration pipelines):
 * ```bash
 * AUTO_MIGRATE_EVENTS=false
 * ```
 *
 * The migration runner is **idempotent** - running it multiple times is safe.
 * If migrations have already been applied, they will be skipped automatically.
 *
 * @decorator `@Global()` - Makes this module's exports available globally
 * @decorator `@Module()` - NestJS module configuration
 *
 * @example
 * ```typescript
 * // app.module.ts - Import the module once in your application root
 * import { Module } from '@nestjs/common';
 * import { OutboxDbModule } from '@package/db-outbox';
 *
 * @Module({
 *   imports: [OutboxDbModule],
 * })
 * export class AppModule {}
 * ```
 *
 * @example
 * ```typescript
 * // outbox.repository.ts - Inject the database instance
 * import { Inject, Injectable } from '@nestjs/common';
 * import { EVENT_STORE_DB, outbox } from '@package/db-outbox';
 * import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
 *
 * @Injectable()
 * export class OutboxRepository {
 *   constructor(
 *     @Inject(EVENT_STORE_DB)
 *     private readonly db: NodePgDatabase
 *   ) {}
 *
 *   async createEvent(event: NewOutboxRecord): Promise<void> {
 *     await this.db.insert(outbox).values(event);
 *   }
 * }
 * ```
 *
 * @see {@link EVENT_STORE_DB} - Injection token for the database instance
 * @see {@link db} - The lazy-initialized Drizzle database instance
 * @see {@link runMigrations} - Migration runner for programmatic execution
 */
@Global()
@Module({
  providers: [
    {
      provide: EVENT_STORE_DB,
      useValue: db
    }
  ],
  exports: [EVENT_STORE_DB]
})
export class OutboxDbModule implements OnModuleInit {
  private readonly logger = new Logger(OutboxDbModule.name);

  /**
   * NestJS lifecycle hook called when the module is initialized.
   *
   * Automatically runs database migrations in all environments to ensure the
   * outbox table exists. This is idempotent - if migrations have already been
   * applied, they will be skipped.
   *
   * @remarks
   * - Runs in ALL environments by default (development, test, production)
   * - Can be disabled by setting `AUTO_MIGRATE_EVENTS=false`
   * - Uses `EVENTS_DATABASE_URL` or falls back to `DATABASE_URL`
   * - Migration failures are logged as warnings, not errors, since migrations
   *   may have already been run externally
   *
   * @example
   * ```bash
   * # Disable auto-migrations (e.g., in production with CI/CD migrations)
   * AUTO_MIGRATE_EVENTS=false
   * ```
   */
  async onModuleInit(): Promise<void> {
    // Check if auto-migrations are disabled
    const autoMigrate = process.env['AUTO_MIGRATE_EVENTS'] !== 'false';

    if (!autoMigrate) {
      this.logger.log('Auto-migrations disabled (AUTO_MIGRATE_EVENTS=false)');
      return;
    }

    const databaseUrl = process.env['EVENTS_DATABASE_URL'] || process.env['DATABASE_URL'];

    if (!databaseUrl) {
      this.logger.warn('DATABASE_URL not set, skipping migrations');
      return;
    }

    const env = process.env['NODE_ENV'] || 'development';

    try {
      this.logger.log(`[${env.toUpperCase()}] Running events database migrations...`);
      await runMigrations(databaseUrl);
      this.logger.log(`[${env.toUpperCase()}] Events database migrations completed`);
    } catch (error) {
      // Log error but don't fail - migrations may have already been run
      // by CI/CD, manual scripts, or previous startups
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Already migrated')) {
        this.logger.debug(`[${env.toUpperCase()}] Events migrations already applied`);
      } else {
        this.logger.warn(`[${env.toUpperCase()}] Events migration warning:`, errorMessage);
      }
    }
  }
}
