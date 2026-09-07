import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load environment variables from API .env file
config({ path: '../../apps/api/.env' });

export default defineConfig({
  schema: './src/schemas/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] || ''
  },
  strict: true,
  verbose: true
});
