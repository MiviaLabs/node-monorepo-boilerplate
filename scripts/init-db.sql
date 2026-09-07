-- =============================================================================
-- Local Development Database Initialization Script
-- =============================================================================
-- This script is run automatically when the PostgreSQL container starts.
-- It sets up the database schema with required extensions.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- pgvector is enabled in the base init.sql file
-- This file runs after the base initialization

-- Create schemas for multi-tenant architecture
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;

-- Comment schemas
COMMENT ON SCHEMA app IS 'Application data schema';
COMMENT ON SCHEMA audit IS 'Audit and logging schema';

-- Grant permissions on schemas
GRANT USAGE ON SCHEMA app TO PUBLIC;
GRANT USAGE ON SCHEMA audit TO PUBLIC;

-- Log initialization completion
DO $$
BEGIN
    RAISE NOTICE 'Database initialization completed successfully';
    RAISE NOTICE 'Extensions enabled: uuid-ossp, pgcrypto, pg_trgm, vector';
    RAISE NOTICE 'Schemas created: app, audit';
END $$;
