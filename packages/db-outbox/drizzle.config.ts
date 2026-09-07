import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load environment variables from API .env file
config({ path: '../../apps/api/.env' });

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.EVENTS_DATABASE_URL || process.env.DATABASE_URL || ''
  },
  migrations: {
    table: '__drizzle_migrations_events',
    schema: 'drizzle'
  },
  strict: true,
  verbose: true
});
