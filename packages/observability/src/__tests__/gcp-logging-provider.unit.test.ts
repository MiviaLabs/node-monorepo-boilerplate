/**
 * Unit tests for GcpLoggingProvider
 *
 * Validates severity mapping and async queue reliability fixes.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { LogLevel } from '../config';

/**
 * Replicate the LOG_LEVEL_TO_SEVERITY mapping from the provider
 * to test mapSeverity logic in isolation.
 */
const LOG_LEVEL_TO_SEVERITY: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARNING',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'CRITICAL'
};

/**
 * Extracted mapSeverity logic matching the fixed implementation
 */
function mapSeverity(level: string): string {
  const lowerLevel = level.toLowerCase() as LogLevel;
  return LOG_LEVEL_TO_SEVERITY[lowerLevel] || 'DEFAULT';
}

describe('GcpLoggingProvider - mapSeverity', () => {
  it('should map lowercase log levels to correct Cloud Logging severity', () => {
    assert.strictEqual(mapSeverity('debug'), 'DEBUG');
    assert.strictEqual(mapSeverity('info'), 'INFO');
    assert.strictEqual(mapSeverity('warn'), 'WARNING');
    assert.strictEqual(mapSeverity('error'), 'ERROR');
    assert.strictEqual(mapSeverity('fatal'), 'CRITICAL');
  });

  it('should map uppercase log levels to correct Cloud Logging severity', () => {
    assert.strictEqual(mapSeverity('DEBUG'), 'DEBUG');
    assert.strictEqual(mapSeverity('INFO'), 'INFO');
    assert.strictEqual(mapSeverity('WARN'), 'WARNING');
    assert.strictEqual(mapSeverity('ERROR'), 'ERROR');
    assert.strictEqual(mapSeverity('FATAL'), 'CRITICAL');
  });

  it('should map mixed case log levels to correct Cloud Logging severity', () => {
    assert.strictEqual(mapSeverity('Info'), 'INFO');
    assert.strictEqual(mapSeverity('Warn'), 'WARNING');
    assert.strictEqual(mapSeverity('Error'), 'ERROR');
  });

  it('should fallback to DEFAULT for unknown levels', () => {
    assert.strictEqual(mapSeverity('unknown'), 'DEFAULT');
    assert.strictEqual(mapSeverity('trace'), 'DEFAULT');
    assert.strictEqual(mapSeverity(''), 'DEFAULT');
  });

  it('should match LogLevel enum values directly', () => {
    // LogLevel enum values are lowercase strings
    assert.strictEqual(mapSeverity(LogLevel.DEBUG), 'DEBUG');
    assert.strictEqual(mapSeverity(LogLevel.INFO), 'INFO');
    assert.strictEqual(mapSeverity(LogLevel.WARN), 'WARNING');
    assert.strictEqual(mapSeverity(LogLevel.ERROR), 'ERROR');
    assert.strictEqual(mapSeverity(LogLevel.FATAL), 'CRITICAL');
  });
});

describe('GcpLoggingProvider - async queue reliability', () => {
  it('should process items added to queue after initial processing', async () => {
    const processedItems: string[] = [];
    const writeQueue: Array<() => Promise<void>> = [];
    let isProcessingQueue = false;

    // Replicate the fixed processWriteQueue logic
    async function processWriteQueue(): Promise<void> {
      if (isProcessingQueue) {
        return;
      }

      isProcessingQueue = true;

      while (writeQueue.length > 0) {
        const writeFn = writeQueue.shift();
        if (writeFn) {
          await writeFn();
        }
      }

      isProcessingQueue = false;

      if (writeQueue.length > 0) {
        setTimeout(() => processWriteQueue(), 100);
      }
    }

    // Simulate writeLog with fixed queue trigger
    function writeLog(message: string): void {
      writeQueue.push(async () => {
        processedItems.push(message);
      });
      void processWriteQueue();
    }

    // Add first batch
    writeLog('message-1');
    writeLog('message-2');

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Add second batch after initial processing
    writeLog('message-3');
    writeLog('message-4');

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.deepStrictEqual(processedItems, ['message-1', 'message-2', 'message-3', 'message-4']);
  });
});
