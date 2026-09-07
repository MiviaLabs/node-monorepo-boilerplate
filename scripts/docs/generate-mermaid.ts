/**
 * Generate PNG diagrams from Mermaid .mmd files.
 *
 * This script discovers all .mmd files in .agents/docs/reference/diagrams/mermaid/,
 * renders them to PNG using mmdc, captures logs, and reports failures.
 *
 * @example
 * ```bash
 * pnpm run docs:mermaid
 * ```
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const MERMAID_DIR = '.agents/docs/reference/diagrams/mermaid';
const IMAGE_DIR = '.agents/docs/reference/diagrams/png';
const LOG_DIR = '/tmp/agentic';
const CONFIG_FILE = 'mermaid.config.json';

/** Scale factor for PNG output — 3× produces crisp diagrams. */
const MERMAID_SCALE_FACTOR = '3';

/**
 * Select puppeteer config based on environment.
 * CI environments require --no-sandbox due to container restrictions.
 */
const PUPPETEER_CONFIG_FILE =
  process.env.CI === 'true' ? 'puppeteer.ci.config.json' : 'puppeteer.config.json';

interface IRenderResult {
  file: string;
  success: boolean;
  output: string;
  error: string;
}

interface IPuppeteerCheckResult {
  installed: boolean;
  cacheDir: string;
  details: string;
}

/**
 * Discovers all .mmd files in the mermaid directory.
 *
 * @returns Array of .mmd file paths
 */
function discoverMermaidFiles(): string[] {
  if (!existsSync(MERMAID_DIR)) {
    return [];
  }

  return readdirSync(MERMAID_DIR)
    .filter((file) => file.endsWith('.mmd'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => join(MERMAID_DIR, file));
}

/**
 * Checks if Puppeteer/Chrome is properly installed for mermaid-cli.
 *
 * @returns Object with installation status and details
 */
function checkPuppeteerInstallation(): IPuppeteerCheckResult {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer');

  if (!existsSync(cacheDir)) {
    return {
      installed: false,
      cacheDir,
      details: `Puppeteer cache directory does not exist: ${cacheDir}`
    };
  }

  // Check for chrome directory (not chrome-headless-shell)
  const entries = readdirSync(cacheDir);
  const chromeDirs = entries.filter(
    (d: string) => d.startsWith('chrome') && !d.includes('headless-shell')
  );

  if (chromeDirs.length === 0) {
    const found = entries.length > 0 ? entries.join(', ') : 'nothing';
    return {
      installed: false,
      cacheDir,
      details: `No Chrome installation found in ${cacheDir}. Found: ${found}`
    };
  }

  return {
    installed: true,
    cacheDir,
    details: `Chrome installations found: ${chromeDirs.join(', ')}`
  };
}

/**
 * Extracts useful error information from mermaid-cli output.
 *
 * @param error - Raw error string
 * @returns Formatted error message with actionable guidance
 */
function formatError(error: string): string {
  // Filter out npm warnings
  const lines = error
    .split('\n')
    .filter((line: string) => !line.includes('npm warn'))
    .join('\n')
    .trim();

  // Check for Chrome not found error
  if (lines.includes('Could not find Chrome')) {
    return [
      'Chrome browser not found for Puppeteer.',
      '',
      'SOLUTION: Install Chrome browser for Puppeteer:',
      '  npx puppeteer browsers install chrome',
      '',
      'NOTE: mermaid-cli requires "chrome", NOT "chrome-headless-shell"'
    ].join('\n');
  }

  // Check for sandbox error
  if (lines.includes('Running as root without --no-sandbox')) {
    return [
      'Chrome sandbox error in CI environment.',
      '',
      'SOLUTION: Use puppeteer.ci.config.json with --no-sandbox flag.',
      'Set CI=true environment variable.'
    ].join('\n');
  }

  // Check for connection error
  if (lines.includes('ECONNREFUSED') || lines.includes('Protocol error')) {
    return [
      'Chrome connection failed.',
      '',
      'SOLUTION: Ensure Chrome is properly installed and the config has proper args:',
      '  --no-sandbox',
      '  --disable-setuid-sandbox',
      '  --disable-dev-shm-usage'
    ].join('\n');
  }

  return lines || 'Unknown error';
}

/**
 * Renders a single .mmd file to PNG.
 *
 * @param inputFile - Path to the .mmd file
 * @returns Render result with `success` flag, captured `output`, and `error` string on failure
 */
function renderFile(inputFile: string): IRenderResult {
  const baseName = basename(inputFile, '.mmd');
  const outputFile = join(IMAGE_DIR, `${baseName}.png`);
  const logFile = join(LOG_DIR, `mermaid-${baseName}.log`);

  const result = spawnSync(
    'npx',
    [
      'mmdc',
      '-i',
      inputFile,
      '-o',
      outputFile,
      '-c',
      CONFIG_FILE,
      '-p',
      PUPPETEER_CONFIG_FILE,
      '-s',
      MERMAID_SCALE_FACTOR
    ],
    {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );

  const output = result.stdout || '';
  const stderr = result.stderr || '';
  const spawnError = result.error ? `${result.error.name}: ${result.error.message}` : '';
  const error = [stderr, spawnError].filter(Boolean).join('\n');
  const fullLog = `=== ${inputFile} ===\nSTDOUT:\n${output}\nSTDERR:\n${error}\nEXIT CODE: ${result.status}\n`;

  // Write log file
  writeFileSync(logFile, fullLog);

  return {
    file: inputFile,
    success: result.status === 0,
    output,
    error
  };
}

/**
 * Main execution function.
 */
function main(): void {
  console.log('Generating Mermaid diagrams as PNG...\n');

  // Check environment
  const isCI = process.env.CI === 'true';
  console.log(`Environment: ${isCI ? 'CI' : 'Local'}`);
  console.log(`Puppeteer config: ${PUPPETEER_CONFIG_FILE}`);

  // Check Puppeteer installation
  const puppeteerCheck = checkPuppeteerInstallation();
  if (!puppeteerCheck.installed) {
    console.error('\nWARNING: Puppeteer/Chrome installation issue detected:');
    console.error(`  ${puppeteerCheck.details}`);
    console.error('\nTo fix, run: npx puppeteer browsers install chrome\n');
  } else {
    console.log(`Puppeteer cache: ${puppeteerCheck.cacheDir}`);
    console.log(`  ${puppeteerCheck.details}\n`);
  }

  // Ensure directories exist
  if (!existsSync(IMAGE_DIR)) {
    mkdirSync(IMAGE_DIR, { recursive: true });
  }
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  // Discover files
  const files = discoverMermaidFiles();

  if (files.length === 0) {
    console.error('ERROR: No .mmd files found in', MERMAID_DIR);
    process.exit(1);
  }

  console.log(`Found ${files.length} .mmd file(s):\n`);

  // Render each file
  const results: IRenderResult[] = [];
  for (const file of files) {
    console.log(`  Rendering: ${file}`);
    const result = renderFile(file);
    results.push(result);

    if (result.success) {
      console.log(`    + Success`);
    } else {
      console.log(`    x Failed`);
      if (result.error) {
        const formattedError = formatError(result.error);
        const indentedError = formattedError.split('\n').join('\n      ');
        console.log(`      Error: ${indentedError}`);
      }
    }
  }

  // Summary
  const failures = results.filter((r: IRenderResult) => !r.success);
  const successes = results.filter((r: IRenderResult) => r.success);

  console.log('\n--- Summary ---');
  console.log(`  Total:    ${results.length}`);
  console.log(`  Success:  ${successes.length}`);
  console.log(`  Failed:   ${failures.length}`);
  console.log(`  Logs:     ${LOG_DIR}/mermaid-*.log`);

  if (failures.length > 0) {
    console.log('\nFailed files:');
    for (const f of failures) {
      console.log(`  - ${f.file}`);
    }

    // Additional troubleshooting for CI
    if (isCI) {
      console.log('\n--- CI Troubleshooting ---');
      console.log('1. Ensure Chrome (not chrome-headless-shell) is installed:');
      console.log('   npx puppeteer browsers install chrome');
      console.log('2. Verify puppeteer.ci.config.json has --no-sandbox flag');
      console.log('3. Check Puppeteer cache directory exists');
    }

    process.exit(1);
  }

  console.log('\nAll diagrams generated successfully.');
}

main();
