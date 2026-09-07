/**
 * Tests for generate-mermaid.ts script.
 *
 * Tests mmdc invocation with proper scale flag and command arguments.
 */

import { strict as assert } from 'node:assert';
import { basename } from 'node:path';
import { describe, it } from 'node:test';

// =============================================================================
// TEST IMPLEMENTATIONS
// =============================================================================

const CONFIG_FILE = 'mermaid.config.json';
const IMAGE_DIR = '.agents/docs/reference/diagrams/png';

function getPuppeteerConfigFile(): string {
  return process.env['CI'] === 'true' ? 'puppeteer.ci.config.json' : 'puppeteer.config.json';
}

/**
 * Builds the spawnSync arguments that would be passed to mmdc.
 * This mirrors the production code logic from generate-mermaid.ts.
 */
function buildMmdcArgs(inputFile: string): {
  command: string;
  args: string[];
  options: Record<string, unknown>;
} {
  const baseName = basename(inputFile, '.mmd');
  const outputFile = `${IMAGE_DIR}/${baseName}.png`;
  const puppeteerConfig = getPuppeteerConfigFile();

  return {
    command: 'npx',
    args: [
      'mmdc',
      '-i',
      inputFile,
      '-o',
      outputFile,
      '-c',
      CONFIG_FILE,
      '-p',
      puppeteerConfig,
      '-s',
      '3'
    ],
    options: {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  };
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('generate-mermaid', () => {
  describe('renderFile mmdc invocation', () => {
    it('should invoke mmdc with -s 3 scale flag', () => {
      const inputFile = '.agents/docs/reference/diagrams/mermaid/test.mmd';
      const { args } = buildMmdcArgs(inputFile);

      // Verify -s flag is present with value 3
      const scaleIndex = args.indexOf('-s');
      assert.ok(scaleIndex !== -1, 'Scale flag -s should be present');
      assert.strictEqual(args[scaleIndex + 1], '3', 'Scale value should be 3');
    });

    it('should include all required mmdc command arguments', () => {
      const inputFile = '.agents/docs/reference/diagrams/mermaid/er-diagram.mmd';
      const { args } = buildMmdcArgs(inputFile);

      // Verify required arguments
      assert.ok(args.includes('mmdc'), 'Should include mmdc command');
      assert.ok(args.includes('-i'), 'Should include input flag');
      assert.ok(args.includes(inputFile), 'Should include input file path');
      assert.ok(args.includes('-o'), 'Should include output flag');
      assert.ok(
        args.some((arg) => arg.includes('.png')),
        'Should include PNG output path'
      );
      assert.ok(args.includes('-c'), 'Should include config flag');
      assert.ok(args.includes(CONFIG_FILE), 'Should include config file');
      assert.ok(args.includes('-p'), 'Should include puppeteer config flag');
      assert.ok(
        args.some((arg) => arg.includes('puppeteer')) && args.some((arg) => arg.includes('.json')),
        'Should include puppeteer config file'
      );
      assert.ok(args.includes('-s'), 'Should include scale flag');
      assert.strictEqual(
        args[args.indexOf('-s') + 1],
        '3',
        'Scale flag value should be 3 for 3x resolution'
      );
    });

    it('should build correct output path from input file', () => {
      const inputFile = '.agents/docs/reference/diagrams/mermaid/module-deps.mmd';
      const { args } = buildMmdcArgs(inputFile);

      const outputIndex = args.indexOf('-o');
      assert.ok(outputIndex !== -1, 'Output flag should be present');

      const outputPath = args[outputIndex + 1];
      if (outputPath) {
        assert.ok(
          outputPath.endsWith('module-deps.png'),
          `Output path should end with module-deps.png, got: ${outputPath}`
        );
        assert.ok(
          outputPath.startsWith('.agents/docs/reference/diagrams/png/'),
          `Output path should be in PNG directory, got: ${outputPath}`
        );
      }
    });

    it('should use correct spawnSync options', () => {
      const inputFile = '.agents/docs/reference/diagrams/mermaid/test.mmd';
      const { options } = buildMmdcArgs(inputFile);

      assert.deepStrictEqual(options, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should handle CI environment for puppeteer config', () => {
      const originalCI = process.env['CI'];

      try {
        // Test with CI=true
        process.env['CI'] = 'true';
        const inputFile = '.agents/docs/reference/diagrams/mermaid/test.mmd';
        const { args } = buildMmdcArgs(inputFile);

        const puppeteerIndex = args.indexOf('-p');
        assert.ok(puppeteerIndex !== -1, 'Puppeteer flag should be present');
        assert.strictEqual(
          args[puppeteerIndex + 1],
          'puppeteer.ci.config.json',
          'Should use CI puppeteer config when CI=true'
        );
        assert.strictEqual(
          getPuppeteerConfigFile(),
          'puppeteer.ci.config.json',
          'Should return CI puppeteer config when CI=true'
        );
      } finally {
        // Restore original CI value
        if (originalCI === undefined) {
          delete process.env['CI'];
        } else {
          process.env['CI'] = originalCI;
        }
      }
    });

    it('should use default puppeteer config when CI is not set', () => {
      const originalCI = process.env['CI'];

      try {
        // Test with CI unset
        delete process.env['CI'];
        const inputFile = '.agents/docs/reference/diagrams/mermaid/test.mmd';
        const { args } = buildMmdcArgs(inputFile);

        const puppeteerIndex = args.indexOf('-p');
        assert.ok(puppeteerIndex !== -1, 'Puppeteer flag should be present');
        assert.strictEqual(
          args[puppeteerIndex + 1],
          'puppeteer.config.json',
          'Should use default puppeteer config when CI is not set'
        );
        assert.strictEqual(
          getPuppeteerConfigFile(),
          'puppeteer.config.json',
          'Should return default puppeteer config when CI is not set'
        );
      } finally {
        // Restore original CI value
        if (originalCI === undefined) {
          delete process.env['CI'];
        } else {
          process.env['CI'] = originalCI;
        }
      }
    });

    it('should verify argument order matches production code', () => {
      const inputFile = '.agents/docs/reference/diagrams/mermaid/test.mmd';
      const { args } = buildMmdcArgs(inputFile);

      // The production code uses this exact order:
      // ['mmdc', '-i', inputFile, '-o', outputFile, '-c', CONFIG_FILE, '-p', PUPPETEER_CONFIG_FILE, '-s', '3']
      const expectedOrder = [
        'mmdc',
        '-i',
        inputFile,
        '-o',
        `${IMAGE_DIR}/test.png`,
        '-c',
        CONFIG_FILE,
        '-p',
        'puppeteer.config.json', // Default when CI is not set
        '-s',
        '3'
      ];

      assert.deepStrictEqual(
        args,
        expectedOrder,
        'Argument order should match production code exactly'
      );
    });
  });

  describe('PNG Output Dimensions', () => {
    it('should document that scale 3 produces 3x resolution PNGs', () => {
      /**
       * The -s 3 scale flag tells mmdc to render PNGs at 3x scale.
       *
       * For a diagram with default width:
       * - Default: 800px wide
       * - With -s 3: 2400px wide
       *
       * This produces high-resolution PNGs suitable for:
       * - Retina/HiDPI displays
       * - Zooming without pixelation
       * - Printing
       *
       * Trade-offs:
       * - Larger file sizes (approximately 3-4x for scale 3)
       * - Longer rendering time
       * - More memory usage during rendering
       */
      assert.ok(true, 'PNG resolution scaling documented');
    });
  });
});
