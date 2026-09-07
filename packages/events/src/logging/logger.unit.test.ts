/**
 * Characterization + laziness tests for the default events logger.
 *
 * The default `logger` singleton must be LAZY: importing this module must not
 * construct or emit anything until the logger is actually used. This module is
 * imported by the whole events package; eager construction at import time
 * created import-order hazards and made the module unsafe to import in tests
 * that assert on console output.
 */
import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { logger, setLoggerConfig, LogLevel } from './logger';
import type { LogEntry } from './logger';

describe('default logger singleton', () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  let captured: LogEntry[] = [];

  beforeEach(() => {
    captured = [];
    // Route the default logger into a capture array for each test and reset
    // level filtering (setConfig merges, so minLevel persists across tests).
    setLoggerConfig({
      consoleEnabled: false,
      minLevel: LogLevel.Info,
      handler: (entry) => captured.push(entry)
    });
  });

  afterEach(() => {
    // Restore console output defaults for other suites.
    setLoggerConfig({ consoleEnabled: true });
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  });

  it('routes info logs to the configured handler', () => {
    logger.info('hello', { key: 'value' });

    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0]?.level, LogLevel.Info);
    assert.strictEqual(captured[0]?.message, 'hello');
    assert.strictEqual(captured[0]?.key, 'value');
    assert.strictEqual(typeof captured[0]?.timestamp, 'string');
  });

  it('routes warn and error with correct levels', () => {
    logger.warn('w');
    logger.error('e');

    assert.deepStrictEqual(
      captured.map((e) => e.level),
      [LogLevel.Warn, LogLevel.Error]
    );
  });

  it('respects minLevel filtering', () => {
    setLoggerConfig({ minLevel: LogLevel.Error });

    logger.info('dropped');
    logger.warn('dropped');
    logger.error('kept');

    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0]?.message, 'kept');
  });

  it('setLoggerConfig can restore console output (integration with console)', () => {
    let consoleCalls = 0;
    console.log = () => {
      consoleCalls += 1;
    };

    setLoggerConfig({ consoleEnabled: true, handler: undefined });
    logger.info('to console');

    assert.strictEqual(consoleCalls, 1);
  });

  it('does not emit anything during module import (lazy singleton)', async () => {
    // Fresh dynamic import in a state where console is instrumented: the
    // module must not log at import time.
    const calls: string[] = [];
    console.log = (...args: unknown[]) => {
      calls.push(`log:${String(args[0])}`);
    };
    console.warn = (...args: unknown[]) => {
      calls.push(`warn:${String(args[0])}`);
    };
    console.error = (...args: unknown[]) => {
      calls.push(`error:${String(args[0])}`);
    };

    await import('./logger');

    assert.strictEqual(calls.length, 0);
  });
});
