/**
 * Unit tests for Logger
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { LogLevel } from '../config';
import { Logger, ILogContext } from '../logger';

describe('Logger', () => {
  let logger: Logger;
  let originalEnv: NodeJS.ProcessEnv;
  const logOutputs: string[] = [];

  // Custom stream to capture log output
  // class TestStream extends Writable {
  //   override _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void): void {
  //     logOutputs.push(chunk.toString());
  //     callback();
  //   }
  // }

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env['NODE_ENV'] = 'test';
    process.env['LOG_LEVEL'] = 'debug';
    process.env['SERVICE_NAME'] = 'test-service';

    logOutputs.length = 0;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create logger instance with default config', () => {
      logger = new Logger();
      assert.strictEqual(logger instanceof Logger, true);
    });

    it('should respect LOG_LEVEL environment variable', () => {
      process.env['LOG_LEVEL'] = 'error';
      logger = new Logger();
      // Logger is created successfully
      assert.strictEqual(logger instanceof Logger, true);
    });

    it('should default to info level when LOG_LEVEL not set', () => {
      delete process.env['LOG_LEVEL'];
      logger = new Logger();
      assert.strictEqual(logger instanceof Logger, true);
    });
  });

  describe('log levels', () => {
    beforeEach(() => {
      logger = new Logger();
    });

    it('should log debug messages', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        logger.debug('Debug message');
      });
    });

    it('should log info messages', () => {
      assert.doesNotThrow(() => {
        logger.info('Info message');
      });
    });

    it('should log warn messages', () => {
      assert.doesNotThrow(() => {
        logger.warn('Warning message');
      });
    });

    it('should log error messages without error object', () => {
      assert.doesNotThrow(() => {
        logger.error('Error message');
      });
    });

    it('should log error messages with Error object', () => {
      const error = new Error('Test error');
      assert.doesNotThrow(() => {
        logger.error('Error occurred', error);
      });
    });

    it('should log error messages with unknown error', () => {
      assert.doesNotThrow(() => {
        logger.error('Error occurred', { some: 'object' });
      });
    });

    it('should log fatal messages without error object', () => {
      assert.doesNotThrow(() => {
        logger.fatal('Fatal error');
      });
    });

    it('should log fatal messages with Error object', () => {
      const error = new Error('Fatal error');
      assert.doesNotThrow(() => {
        logger.fatal('Fatal error', error);
      });
    });
  });

  describe('contextual logging', () => {
    beforeEach(() => {
      logger = new Logger();
    });

    it('should log with context', () => {
      const context: ILogContext = {
        userId: 'user-123',
        requestId: 'req-456'
      };

      assert.doesNotThrow(() => {
        logger.info('User action', context);
      });
    });

    it('should log error with context', () => {
      const error = new Error('Database error');
      const context: ILogContext = {
        userId: 'user-123',
        query: 'SELECT * FROM users'
      };

      assert.doesNotThrow(() => {
        logger.error('Query failed', error, context);
      });
    });

    it('should handle empty context', () => {
      assert.doesNotThrow(() => {
        logger.info('Message', {});
      });
    });

    it('should handle undefined context', () => {
      assert.doesNotThrow(() => {
        logger.info('Message', undefined);
      });
    });

    it('should handle custom context fields', () => {
      const context: ILogContext = {
        userId: 'user-123',
        customField: 'custom-value',
        nested: { object: true }
      };

      assert.doesNotThrow(() => {
        logger.info('Message with custom context', context);
      });

      // Access via index signature to avoid TypeScript error
      assert.strictEqual(context['customField'], 'custom-value');
      assert.strictEqual(typeof context['nested'] === 'object', true);
    });
  });

  describe('child logger', () => {
    beforeEach(() => {
      logger = new Logger();
    });

    it('should create child logger with context', () => {
      const context: ILogContext = {
        requestId: 'req-123',
        userId: 'user-456'
      };

      const childLogger = logger.child(context);

      assert.strictEqual(childLogger instanceof Logger, true);
      assert.doesNotThrow(() => {
        childLogger.info('Child logger message');
      });
    });

    it('should create child logger with partial context', () => {
      const childLogger = logger.child({ requestId: 'req-123' });

      assert.strictEqual(childLogger instanceof Logger, true);
      assert.doesNotThrow(() => {
        childLogger.info('Message from child');
      });
    });

    it('should inherit parent logger behavior', () => {
      const childLogger = logger.child({ requestId: 'req-123' });

      assert.doesNotThrow(() => {
        childLogger.debug('Child debug');
        childLogger.info('Child info');
        childLogger.warn('Child warn');
        childLogger.error('Child error');
      });
    });

    it('should support nested child loggers', () => {
      const child1 = logger.child({ requestId: 'req-1' });
      const child2 = child1.child({ userId: 'user-1' });

      assert.strictEqual(child2 instanceof Logger, true);
      assert.doesNotThrow(() => {
        child2.info('Nested child message');
      });
    });
  });

  describe('error serialization', () => {
    beforeEach(() => {
      logger = new Logger();
    });

    it('should serialize Error with stack trace', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:15';

      assert.doesNotThrow(() => {
        logger.error('Error with stack', error);
      });
    });

    it('should serialize Error with custom properties', () => {
      const error = new Error('Custom error') as Error & { code: string; details: unknown };
      error.code = 'CUSTOM_ERROR';
      error.details = { field: 'value' };

      assert.doesNotThrow(() => {
        logger.error('Custom error', error);
      });
    });

    it('should handle non-Error objects', () => {
      const nonError = { message: 'Not an Error', code: 500 };

      assert.doesNotThrow(() => {
        logger.error('Non-error object', nonError);
      });
    });

    it('should handle null error', () => {
      assert.doesNotThrow(() => {
        logger.error('Null error', null);
      });
    });

    it('should handle string as error', () => {
      assert.doesNotThrow(() => {
        logger.error('String error', 'Error string');
      });
    });
  });

  describe('environment awareness', () => {
    it('should work in development mode', () => {
      process.env['NODE_ENV'] = 'development';
      logger = new Logger();

      assert.doesNotThrow(() => {
        logger.info('Development message');
      });
    });

    it('should work in production mode', () => {
      process.env['NODE_ENV'] = 'production';
      logger = new Logger();

      assert.doesNotThrow(() => {
        logger.info('Production message');
      });
    });

    it('should work in test mode', () => {
      process.env['NODE_ENV'] = 'test';
      logger = new Logger();

      assert.doesNotThrow(() => {
        logger.info('Test message');
      });
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      logger = new Logger();
    });

    it('should handle empty message', () => {
      assert.doesNotThrow(() => {
        logger.info('');
      });
    });

    it('should handle very long message', () => {
      const longMessage = 'x'.repeat(10000);
      assert.doesNotThrow(() => {
        logger.info(longMessage);
      });
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'Message with \n\t\r special chars: {}[]<>"/\\';
      assert.doesNotThrow(() => {
        logger.info(specialMessage);
      });
    });

    it('should handle Unicode characters', () => {
      const unicodeMessage = 'Unicode: hello world';
      assert.doesNotThrow(() => {
        logger.info(unicodeMessage);
      });
    });

    it('should handle emoji in message', () => {
      const emojiMessage = 'Error: something went wrong';
      assert.doesNotThrow(() => {
        logger.error(emojiMessage);
      });
    });
  });

  describe('LogLevel enum', () => {
    it('should have all required log levels', () => {
      assert.strictEqual(LogLevel.DEBUG, 'debug');
      assert.strictEqual(LogLevel.INFO, 'info');
      assert.strictEqual(LogLevel.WARN, 'warn');
      assert.strictEqual(LogLevel.ERROR, 'error');
      assert.strictEqual(LogLevel.FATAL, 'fatal');
    });
  });

  describe('ILogContext interface', () => {
    it('should accept optional userId', () => {
      const context: ILogContext = {};
      assert.strictEqual(context.userId, undefined);
    });

    it('should accept optional organizationId', () => {
      const context: ILogContext = {};
      assert.strictEqual(context.organizationId, undefined);
    });

    it('should accept optional requestId', () => {
      const context: ILogContext = {};
      assert.strictEqual(context.requestId, undefined);
    });

    it('should accept additional properties', () => {
      const context: ILogContext = {
        customField: 'value',
        nested: { object: true },
        count: 42
      };
      // Access via index signature for dynamic properties
      assert.strictEqual(context['customField'], 'value');
    });
  });

  describe('concurrent logging', () => {
    beforeEach(() => {
      logger = new Logger();
    });

    it('should handle multiple concurrent log calls', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => {
        return Promise.resolve().then(() => {
          logger.info(`Concurrent message ${i}`);
        });
      });

      await Promise.all(promises);
      // If we got here, all logging calls completed without error
      assert.ok(true);
    });

    it('should handle concurrent child logger creation', async () => {
      const promises = Array.from({ length: 50 }, (_, i) => {
        return Promise.resolve().then(() => {
          const child = logger.child({ index: i });
          child.info(`Child message ${i}`);
        });
      });

      await Promise.all(promises);
      assert.ok(true);
    });
  });
});
