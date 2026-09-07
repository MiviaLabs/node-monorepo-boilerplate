/**
 * Integration tests for generate-package-deps.ts script.
 *
 * Tests end-to-end execution of the script and validates output.
 *
 * @see scripts/docs/generate-package-deps.ts
 */

import * as path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Timeout for execSync calls to prevent indefinite hangs.
 * Set to 30 seconds to allow adequate time for script execution.
 */
const EXEC_SYNC_TIMEOUT_MS = 30000;

describe('generate-package-deps integration', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const outputFile = path.join(
    projectRoot,
    '.agents/docs/reference/diagrams/mermaid/package-deps.mmd'
  );

  beforeAll(() => {
    // Generate the output file once before all tests run
    execSync('npx tsx scripts/docs/generate-package-deps.ts', {
      stdio: 'pipe',
      cwd: projectRoot,
      timeout: EXEC_SYNC_TIMEOUT_MS
    });
  });

  afterAll(() => {
    // Note: We intentionally do NOT cleanup generated files
    // because they are valuable documentation artifacts.
    // If you need to clean up for testing, uncomment below:
    //
    // if (existsSync(outputFile)) {
    //   try {
    //     unlinkSync(outputFile);
    //   } catch {
    //     console.warn(`Warning: Could not cleanup ${outputFile}`);
    //   }
    // }
  });

  it('should generate diagram from real packages', () => {
    // Verify output file was created
    expect(existsSync(outputFile)).toBe(true);

    // Read the generated content for validation
    const content = readFileSync(outputFile, 'utf-8');

    // Verify Mermaid diagram header
    expect(content).toContain('flowchart TD');

    // Verify subgraphs exist
    expect(content).toContain('subgraph "CORE"');
    expect(content).toContain('subgraph "FEATURE"');
    expect(content).toContain('subgraph "INFRASTRUCTURE"');
  });

  it('should generate valid Mermaid syntax', () => {
    const content = readFileSync(outputFile, 'utf-8');

    // Verify Mermaid diagram header
    expect(content).toContain('flowchart TD');

    // Verify subgraphs exist
    expect(content).toContain('subgraph "CORE"');
    expect(content).toContain('subgraph "FEATURE"');
    expect(content).toContain('subgraph "INFRASTRUCTURE"');

    // Verify nodes have proper labels with @package/ prefix (including hyphenated names)
    expect(content).toMatch(/@package\/[a-z0-9-]+/i);

    // Verify subgraphs are closed
    expect(content.match(/end/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('should include all 20 packages', () => {
    const content = readFileSync(outputFile, 'utf-8');

    // List of expected packages (20 total)
    const expectedPackages = [
      'auth',
      'constants',
      'core',
      'db-outbox',
      'db-core',
      'encryption',
      'errors',
      'events',
      'i18n',
      'observability',
      'opa',
      'pubsub',
      'queues',
      'redis',
      'schema',
      'secrets',
      'tasks',
      'test-utils',
      'types',
      'utils'
    ];

    for (const pkg of expectedPackages) {
      expect(content).toContain(`@package/${pkg}`);
    }
  });

  it('should generate dependency edges', () => {
    const content = readFileSync(outputFile, 'utf-8');

    // Verify at least some dependency edges exist (format: "from --> to")
    const edgePattern = /[a-z0-9-]+ --> [a-z0-9-]+/i;
    expect(content).toMatch(edgePattern);

    // Count edges - should be at least 10 based on package dependencies
    const edges = content.match(/[a-z0-9-]+ --> [a-z0-9-]+/gi);
    expect(edges?.length).toBeGreaterThanOrEqual(10);
  });

  it('should categorize packages correctly', () => {
    const content = readFileSync(outputFile, 'utf-8');

    // Extract CORE subgraph content
    const coreMatch = content.match(/subgraph "CORE"([\s\S]*?)end/);
    expect(coreMatch).not.toBeNull();

    if (coreMatch) {
      const coreContent = coreMatch[1];
      expect(coreContent).toContain('types');
      expect(coreContent).toContain('constants');
      expect(coreContent).toContain('utils');
      expect(coreContent).toContain('errors');
      expect(coreContent).toContain('schema');
    }

    // Extract FEATURE subgraph content
    const featureMatch = content.match(/subgraph "FEATURE"([\s\S]*?)end/);
    expect(featureMatch).not.toBeNull();

    if (featureMatch) {
      const featureContent = featureMatch[1];
      expect(featureContent).toContain('auth');
      expect(featureContent).toContain('core');
      expect(featureContent).toContain('events');
    }

    // Extract INFRASTRUCTURE subgraph content
    const infraMatch = content.match(/subgraph "INFRASTRUCTURE"([\s\S]*?)end/);
    expect(infraMatch).not.toBeNull();

    if (infraMatch) {
      const infraContent = infraMatch[1];
      expect(infraContent).toContain('redis');
      expect(infraContent).toContain('db-core');
      expect(infraContent).toContain('queues');
    }
  });
});
