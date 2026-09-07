import { Global, Logger, Module, DynamicModule, OnModuleInit } from '@nestjs/common';
import { OutboxDbModule } from '@package/db-outbox';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { DATABASE_PROVIDER, MAIN_DB } from './database.constants';
import { databaseProviders } from './database.providers';
import { MIGRATIONS_FOLDER, getMigrationsConfig } from './migration.config';

/**
 * Database Module
 *
 * Provides global access to the Drizzle ORM database instance.
 * This module is marked as @Global() so it doesn't need to be imported
 * in every feature module.
 *
 * IMPORTANT: In test environments (NODE_ENV=test), this module will
 * automatically run migrations to ensure all tables exist.
 * This is needed because the test-utils pool and NestJS app pools
 * are separate, and migrations must be run on both.
 *
 * ## Usage
 *
 * ### Inject the database in repositories/services:
 *
 * ```typescript
 * import { Inject, Injectable } from '@nestjs/common';
 * import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
 * import * as schema from '@package/db-core';
 *
 * @Injectable()
 * export class UserRepository {
 *   constructor(
 *     @Inject('MAIN_DB') private readonly db: NodePgDatabase<typeof schema>
 *   ) {}
 *
 *   async findAll() {
 *     return this.db.select().from(schema.users);
 *   }
 * }
 * ```
 *
 * ### For repositories extending BaseRepository:
 *
 * The BaseRepository already handles database injection.
 * Just pass the database instance to the super constructor:
 *
 * ```typescript
 * import { Injectable } from '@nestjs/common';
 * import { BaseRepository } from '@/common/infrastructure/repositories';
 * import { users } from '@package/db-core';
 *
 * @Injectable()
 * export class UserRepository extends BaseRepository<
 *   typeof users.$inferSelect,
 *   typeof users.$inferInsert,
 *   Partial<typeof users.$inferInsert>
 * > {
 *   constructor(@Inject('MAIN_DB') db: NodePgDatabase<typeof schema>) {
 *     super(db);
 *   }
 *
 *   protected getTable() {
 *     return users;
 *   }
 *
 *   protected getIdColumn() {
 *     return users.id;
 *   }
 *
 *   protected getTenantColumn() {
 *     return users.organizationId;
 *   }
 *
 *   protected getEntityName() {
 *     return 'User';
 *   }
 * }
 * ```
 *
 * ## Environment Variables
 *
 * - `DATABASE_URL`: PostgreSQL connection string (required)
 *
 * ## Multiple Databases
 *
 * For multiple database connections (e.g., separate auth database),
 * create additional modules following this pattern:
 *
 * ```typescript
 * // auth-database.module.ts
 * @Global()
 * @Module({
 *   providers: [
 *     {
 *       provide: 'AUTH_DB',
 *       useFactory: () => drizzle(new Pool({ connectionString: process.env['AUTH_DATABASE_URL'] }), { schema: authSchema }),
 *     },
 *   ],
 *   exports: ['AUTH_DB'],
 * })
 * export class AuthDatabaseModule {}
 * ```
 *
 * @see https://orm.drizzle.team/docs/get-started-postgresql
 */
@Global()
@Module({
  imports: [OutboxDbModule],
  providers: [...databaseProviders],
  exports: [DATABASE_PROVIDER, MAIN_DB]
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name);

  async onModuleInit(): Promise<void> {
    // Always log for debugging
    this.logger.log(
      `[DatabaseModule] onModuleInit called. NODE_ENV=${process.env['NODE_ENV']}, TEST_MODE=${process.env['TEST_MODE']}, JEST_WORKER_ID=${process.env['JEST_WORKER_ID']}`
    );

    // Only run migrations in test environment
    // In production, migrations are run via CI/CD or manual deployment scripts
    const isTestEnvironment =
      process.env['NODE_ENV'] === 'test' ||
      process.env['TEST_MODE'] === 'true' ||
      process.env['JEST_WORKER_ID'] !== undefined; // Set when running in Jest

    this.logger.log(`[DatabaseModule] isTestEnvironment=${isTestEnvironment}`);

    if (isTestEnvironment) {
      const databaseUrl = process.env['DATABASE_URL'];

      if (!databaseUrl) {
        this.logger.warn('DATABASE_URL not set, skipping migrations');
        return;
      }

      try {
        this.logger.log('[TEST] Running main database migrations...');
        // Get the pool from DATABASE_PROVIDER
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: databaseUrl });
        const { drizzle } = await import('drizzle-orm/node-postgres');

        // Create a temporary db instance for running migrations
        const db = drizzle(pool);

        // Get migrations table name dynamically
        const { MIGRATIONS_TABLE } = await getMigrationsConfig();

        await migrate(db, {
          migrationsFolder: MIGRATIONS_FOLDER,
          migrationsTable: MIGRATIONS_TABLE
        });

        await pool.end();

        this.logger.log('[TEST] Main database migrations completed');
      } catch (error) {
        // Log error but don't fail - migrations may have already been run
        // by the test-utils setup
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Already migrated')) {
          this.logger.debug('[TEST] Main migrations already applied');
        } else {
          this.logger.warn('[TEST] Main migration warning:', errorMessage);
        }
      }
    }
  }
  /**
   * Register the database module dynamically with configuration
   *
   * This allows for custom configuration if needed in the future.
   * For now, the default configuration using DATABASE_URL is sufficient.
   */
  static register(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [...databaseProviders],
      exports: [DATABASE_PROVIDER, MAIN_DB]
    };
  }
}
