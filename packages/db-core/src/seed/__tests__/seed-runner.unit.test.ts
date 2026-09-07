/**
 * Unit Tests for Seed Runner
 *
 * Tests seed runner security controls and validation.
 */

import { afterEach, describe, expect, it } from '@jest/globals';

import { checkProductionSafety, redactDatabaseUrl, validateDatabaseUrl } from '../seed-runner';

describe('Seed Runner Security', () => {
  describe('validateDatabaseUrl', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should accept valid postgresql:// URL', () => {
      // Arrange
      const url = 'postgresql://user:pass@localhost:5432/db';

      // Act & Assert - should not throw
      expect(() => validateDatabaseUrl(url)).not.toThrow();
    });

    it('should accept valid postgres:// URL', () => {
      // Arrange
      const url = 'postgres://user:pass@localhost:5432/db';

      // Act & Assert - should not throw
      expect(() => validateDatabaseUrl(url)).not.toThrow();
    });

    it('should reject URL without postgres prefix', () => {
      // Arrange
      const url = 'mysql://user:pass@localhost:3306/db';

      // Act & Assert
      expect(() => validateDatabaseUrl(url)).toThrow(/Invalid DATABASE_URL/);
    });

    it('should reject empty string', () => {
      // Arrange
      const url = '';

      // Act & Assert
      expect(() => validateDatabaseUrl(url)).toThrow(/Invalid DATABASE_URL/);
    });

    it('should reject URL with only protocol', () => {
      // Arrange
      const url = 'postgresql://';

      // Act & Assert
      expect(() => validateDatabaseUrl(url)).toThrow(/Invalid DATABASE_URL/);
    });
  });

  describe('redactDatabaseUrl', () => {
    it('should redact password in postgresql:// URL', () => {
      // Arrange
      const url = 'postgresql://user:secret123@localhost:5432/db';

      // Act
      const redacted = redactDatabaseUrl(url);

      // Assert
      expect(redacted).toBe('postgresql://user:****@localhost:5432/db');
      expect(redacted.includes('secret123')).toBe(false);
    });

    it('should redact password in postgres:// URL', () => {
      // Arrange
      const url = 'postgres://admin:password@host:5432/mydb';

      // Act
      const redacted = redactDatabaseUrl(url);

      // Assert
      expect(redacted).toBe('postgres://admin:****@host:5432/mydb');
      expect(redacted.includes('password')).toBe(false);
    });

    it('should handle URL without password', () => {
      // Arrange
      const url = 'postgresql://localhost:5432/db';

      // Act
      const redacted = redactDatabaseUrl(url);

      // Assert
      expect(redacted).toBe(url);
    });

    it('should handle URL with special characters in password', () => {
      // Arrange - In PostgreSQL URLs, special chars in passwords must be percent-encoded
      // @ becomes %40, ! becomes %21
      const url = 'postgresql://user:p%40ssw0rd%21@localhost:5432/db';

      // Act
      const redacted = redactDatabaseUrl(url);

      // Assert
      expect(redacted).toBe('postgresql://user:****@localhost:5432/db');
      expect(redacted.includes('%40ssw0rd%21')).toBe(false);
    });

    it('should handle URL with @ in password (percent-encoded)', () => {
      // Arrange - @ in password must be percent-encoded as %40
      const url = 'postgresql://user:p%40ss@localhost:5432/db';

      // Act
      const redacted = redactDatabaseUrl(url);

      // Assert
      expect(redacted).toBe('postgresql://user:****@localhost:5432/db');
      expect(redacted.includes('%40ss')).toBe(false);
    });
  });

  describe('checkProductionSafety', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalEnvironment = process.env.ENVIRONMENT;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      process.env.ENVIRONMENT = originalEnvironment;
    });

    it('should allow development environment', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      const config = {
        databaseUrl: 'postgresql://localhost:5432/dev',
        environment: 'development' as const,
        force: false
      };

      // Act & Assert - should not throw
      expect(() => checkProductionSafety(config)).not.toThrow();
    });

    it('should allow testing environment', () => {
      // Arrange
      process.env.NODE_ENV = 'testing';
      const config = {
        databaseUrl: 'postgresql://localhost:5432/test',
        environment: 'testing' as const,
        force: false
      };

      // Act & Assert - should not throw
      expect(() => checkProductionSafety(config)).not.toThrow();
    });

    it('should block production environment without force', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      const config = {
        databaseUrl: 'postgresql://localhost:5432/prod',
        environment: 'development' as const,
        force: false
      };

      // Act & Assert
      expect(() => checkProductionSafety(config)).toThrow(
        /Cannot run seed in production environment/
      );
    });

    it('should block production URL with prod indicator', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      const config = {
        databaseUrl: 'postgresql://prod.example.com:5432/db',
        environment: 'development' as const,
        force: false
      };

      // Act & Assert
      expect(() => checkProductionSafety(config)).toThrow(
        /DATABASE_URL appears to be a production database/
      );
    });

    it('should block AWS RDS URL', () => {
      // Arrange
      const config = {
        databaseUrl: 'postgresql://user:pass@instance.rds.amazonaws.com:5432/db',
        environment: 'development' as const,
        force: false
      };

      // Act & Assert
      expect(() => checkProductionSafety(config)).toThrow(
        /DATABASE_URL appears to be a production database/
      );
    });

    it('should block Azure database URL', () => {
      // Arrange
      const config = {
        databaseUrl: 'postgresql://user:pass@server.database.windows.net:5432/db',
        environment: 'development' as const,
        force: false
      };

      // Act & Assert
      expect(() => checkProductionSafety(config)).toThrow(
        /DATABASE_URL appears to be a production database/
      );
    });

    it('should allow production with force flag', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      const config = {
        databaseUrl: 'postgresql://prod.example.com:5432/db',
        environment: 'development' as const,
        force: true
      };

      // Act & Assert - should not throw when force is true
      expect(() => checkProductionSafety(config)).not.toThrow();
    });

    it('should check ENVIRONMENT variable when NODE_ENV not set', () => {
      // Arrange
      delete process.env.NODE_ENV;
      process.env.ENVIRONMENT = 'staging';
      const config = {
        databaseUrl: 'postgresql://localhost:5432/staging',
        environment: 'staging' as const,
        force: false
      };

      // Act & Assert - should not throw for staging
      expect(() => checkProductionSafety(config)).not.toThrow();
    });

    it('should block -prod in hostname', () => {
      // Arrange
      const config = {
        databaseUrl: 'postgresql://user:pass@my-prod-db.example.com:5432/db',
        environment: 'development' as const,
        force: false
      };

      // Act & Assert
      expect(() => checkProductionSafety(config)).toThrow(
        /DATABASE_URL appears to be a production database/
      );
    });

    it('should block -production in hostname', () => {
      // Arrange
      const config = {
        databaseUrl: 'postgresql://user:pass@db-production.example.com:5432/db',
        environment: 'development' as const,
        force: false
      };

      // Act & Assert
      expect(() => checkProductionSafety(config)).toThrow(
        /DATABASE_URL appears to be a production database/
      );
    });
  });
});
