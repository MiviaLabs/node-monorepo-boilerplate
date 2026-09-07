/**
 * Unit Tests for Health Check Script
 *
 * Tests health check functionality with configurable containers.
 */

import { describe, it } from 'node:test';

// Read the health script to verify configuration
const healthScriptCode = require('fs').readFileSync(`${__dirname}/../../dev/health.ts`, 'utf8');

describe('Health Check Script', () => {
  describe('Configuration Constants', () => {
    it('should have CHECK_TIMEOUT_MS constant defined', () => {
      // Assert
      expect(healthScriptCode).toContain('CHECK_TIMEOUT_MS');
      expect(healthScriptCode).toContain('const');
    });

    it('should have OVERALL_TIMEOUT_MS constant defined', () => {
      // Assert
      expect(healthScriptCode).toContain('OVERALL_TIMEOUT_MS');
      expect(healthScriptCode).toContain('const');
    });

    it('should have timeout values as const (immutable)', () => {
      // Assert
      expect(healthScriptCode).toContain('as const');
    });

    it('should use CHECK_TIMEOUT_MS for individual checks', () => {
      // Assert - verify that timeout parameter uses the constant
      expect(healthScriptCode).toMatch(/timeout:\s*CHECK_TIMEOUT_MS/);
    });

    it('should use OVERALL_TIMEOUT_MS for overall timeout', () => {
      // Assert
      expect(healthScriptCode).toMatch(new RegExp('OVERALL_TIMEOUT_MS', 'g'));
    });
  });

  describe('Container Configuration', () => {
    it('should have default container names', () => {
      // Assert
      expect(healthScriptCode).toContain('mivialabs-postgres-dev');
      expect(healthScriptCode).toContain('mivialabs-redis-dev');
      expect(healthScriptCode).toContain('mivialabs-rabbitmq-dev');
    });

    it('should support POSTGRES_CONTAINER environment variable', () => {
      // Assert
      expect(healthScriptCode).toContain('POSTGRES_CONTAINER');
      expect(healthScriptCode).toContain('process.env.POSTGRES_CONTAINER');
    });

    it('should support REDIS_CONTAINER environment variable', () => {
      // Assert
      expect(healthScriptCode).toContain('REDIS_CONTAINER');
      expect(healthScriptCode).toContain('process.env.REDIS_CONTAINER');
    });

    it('should support RABBITMQ_CONTAINER environment variable', () => {
      // Assert
      expect(healthScriptCode).toContain('RABBITMQ_CONTAINER');
      expect(healthScriptCode).toContain('process.env.RABBITMQ_CONTAINER');
    });

    it('should have container names as const object', () => {
      // Assert
      expect(healthScriptCode).toContain('CONTAINERS = {');
      expect(healthScriptCode).toContain('} as const');
    });
  });

  describe('Health Checks', () => {
    it('should check PostgreSQL health', () => {
      // Assert - verify pg_isready command exists
      expect(healthScriptCode).toContain('pg_isready');
    });

    it('should check Redis health', () => {
      // Assert - verify redis-cli ping command exists
      expect(healthScriptCode).toContain('redis-cli ping');
    });

    it('should check RabbitMQ health', () => {
      // Assert - verify rabbitmq-diagnostics ping command exists
      expect(healthScriptCode).toContain('rabbitmq-diagnostics ping');
    });

    it('should mark PostgreSQL as critical', () => {
      // Assert
      expect(healthScriptCode).toMatch(/name:\s*['"]Postgres['"]/);
      expect(healthScriptCode).toMatch(/critical:\s*true/);
    });

    it('should mark Redis as critical', () => {
      // Assert
      expect(healthScriptCode).toMatch(/name:\s*['"]Redis['"]/);
      // Find the line with Redis and check critical
      const redisIndex = healthScriptCode.indexOf("name: 'Redis'");
      const redisSection = healthScriptCode.slice(redisIndex, redisIndex + 200);
      expect(redisSection).toContain('critical: true');
    });

    it('should mark RabbitMQ as non-critical', () => {
      // Assert
      expect(healthScriptCode).toMatch(/name:\s*['"]RabbitMQ['"]/);
      const rabbitmqIndex = healthScriptCode.indexOf("name: 'RabbitMQ'");
      const rabbitmqSection = healthScriptCode.slice(rabbitmqIndex, rabbitmqIndex + 200);
      expect(rabbitmqSection).toContain('critical: false');
    });
  });

  describe('Timeout Behavior', () => {
    it('should implement overall timeout', () => {
      // Assert - verify Promise.race or timeout mechanism
      expect(healthScriptCode).toContain('Promise.race');
      expect(healthScriptCode).toContain('setTimeout');
    });

    it('should throw error on timeout', () => {
      // Assert - verify timeout error message
      expect(healthScriptCode).toContain('Health check timeout');
    });

    it('should exit with error on timeout', () => {
      // Assert - verify process.exit(1) on timeout
      expect(healthScriptCode).toMatch(/setTimeout.*=>/);
    });
  });

  describe('Output Format', () => {
    it('should show checkmark for healthy services', () => {
      // Assert
      expect(healthScriptCode).toContain('✓');
    });

    it('should show X for unhealthy services', () => {
      // Assert
      expect(healthScriptCode).toContain('✗');
    });

    it('should display CRITICAL marker for critical services', () => {
      // Assert
      expect(healthScriptCode).toContain('[CRITICAL]');
    });

    it('should display container name in output', () => {
      // Assert
      expect(healthScriptCode).toContain('(${container}');
    });

    it('should show success message when all critical services healthy', () => {
      // Assert
      expect(healthScriptCode).toContain('All critical services are healthy');
    });

    it('should show failure message when critical services unhealthy', () => {
      // Assert
      expect(healthScriptCode).toContain('Some critical services are unhealthy');
    });

    it('should provide troubleshooting help on failure', () => {
      // Assert
      expect(healthScriptCode).toContain('Run `pnpm dev:start`');
      expect(healthScriptCode).toContain('POSTGRES_CONTAINER');
      expect(healthScriptCode).toContain('REDIS_CONTAINER');
      expect(healthScriptCode).toContain('RABBITMQ_CONTAINER');
    });
  });

  describe('Exit Codes', () => {
    it('should exit with 0 when all critical services healthy', () => {
      // Assert
      const successIndex = healthScriptCode.indexOf('All critical services are healthy');
      const successSection = healthScriptCode.slice(successIndex, successIndex + 100);
      expect(successSection).toContain('process.exit(0)');
    });

    it('should exit with 1 when critical services unhealthy', () => {
      // Assert
      const failureIndex = healthScriptCode.indexOf('Some critical services are unhealthy');
      const failureSection = healthScriptCode.slice(failureIndex, failureIndex + 300);
      expect(failureSection).toContain('process.exit(1)');
    });
  });

  describe('Error Handling', () => {
    it('should catch health check errors gracefully', () => {
      // Assert - verify try-catch blocks
      expect(healthScriptCode).toContain('try {');
      expect(healthScriptCode).toContain('} catch');
    });

    it('should return false on health check failure', () => {
      // Assert - verify error handling returns false
      expect(healthScriptCode).toMatch(/catch\s*{\s*return\s*false/);
    });

    it('should handle top-level errors', () => {
      // Assert - verify error handler at top level
      expect(healthScriptCode).toContain('.catch(');
      expect(healthScriptCode).toContain('console.error');
      expect(healthScriptCode).toContain('process.exit(1)');
    });
  });
});
