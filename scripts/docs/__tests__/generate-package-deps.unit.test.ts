/**
 * Unit tests for generate-package-deps.ts script.
 *
 * Tests dependency parsing, circular detection, package categorization,
 * and Mermaid diagram generation.
 *
 * @see scripts/docs/generate-package-deps.ts
 */

import type { IPackageNode } from '../generate-package-deps';

// Mock fs.readFileSync for dependency parsing tests
const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.mock('node:fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args)
}));

// =============================================================================
// TEST SUITES
// =============================================================================

describe('generate-package-deps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // parsePackageDependencies
  // ---------------------------------------------------------------------------
  describe('parsePackageDependencies', () => {
    it('should parse @package/* dependencies only', async () => {
      const { parsePackageDependencies } = await import('../generate-package-deps.js');

      const mockPackageJson = {
        dependencies: {
          '@package/types': 'workspace:*',
          '@package/utils': 'workspace:*',
          express: '^4.18.0',
          lodash: '^4.17.21'
        }
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

      const result = parsePackageDependencies('/mock/path/package.json');

      expect(result).toContain('types');
      expect(result).toContain('utils');
      expect(result).not.toContain('express');
      expect(result).not.toContain('lodash');
    });

    it('should handle empty dependencies', async () => {
      const { parsePackageDependencies } = await import('../generate-package-deps.js');

      const mockPackageJson = {
        name: '@package/standalone',
        version: '1.0.0'
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

      const result = parsePackageDependencies('/mock/path/package.json');

      expect(result).toEqual([]);
    });

    it('should include peerDependencies with @package prefix', async () => {
      const { parsePackageDependencies } = await import('../generate-package-deps.js');

      const mockPackageJson = {
        dependencies: {
          '@package/types': 'workspace:*'
        },
        peerDependencies: {
          '@package/core': 'workspace:*',
          react: '^18.0.0'
        }
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

      const result = parsePackageDependencies('/mock/path/package.json');

      expect(result).toContain('types');
      expect(result).toContain('core');
      expect(result).not.toContain('react');
    });

    it('should sort dependencies alphabetically', async () => {
      const { parsePackageDependencies } = await import('../generate-package-deps.js');

      const mockPackageJson = {
        dependencies: {
          '@package/utils': 'workspace:*',
          '@package/auth': 'workspace:*',
          '@package/types': 'workspace:*'
        }
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

      const result = parsePackageDependencies('/mock/path/package.json');

      expect(result).toEqual(['auth', 'types', 'utils']);
    });
  });

  // ---------------------------------------------------------------------------
  // detectCircularDependencies
  // ---------------------------------------------------------------------------
  describe('detectCircularDependencies', () => {
    it('should detect circular dependencies', async () => {
      const { detectCircularDependencies } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'A', category: 'core', dependencies: ['B'] },
        { name: 'B', category: 'core', dependencies: ['A'] }
      ];

      const result = detectCircularDependencies(mockNodes);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty for acyclic graph', async () => {
      const { detectCircularDependencies } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'A', category: 'core', dependencies: ['B'] },
        { name: 'B', category: 'core', dependencies: ['C'] },
        { name: 'C', category: 'core', dependencies: [] }
      ];

      const result = detectCircularDependencies(mockNodes);
      expect(result.length).toBe(0);
    });

    it('should detect transitive circular dependencies', async () => {
      const { detectCircularDependencies } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'A', category: 'core', dependencies: ['B'] },
        { name: 'B', category: 'core', dependencies: ['C'] },
        { name: 'C', category: 'core', dependencies: ['A'] }
      ];

      const result = detectCircularDependencies(mockNodes);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty node list', async () => {
      const { detectCircularDependencies } = await import('../generate-package-deps.js');

      const result = detectCircularDependencies([]);
      expect(result).toEqual([]);
    });

    it('should handle single node without dependencies', async () => {
      const { detectCircularDependencies } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [{ name: 'A', category: 'core', dependencies: [] }];

      const result = detectCircularDependencies(mockNodes);
      expect(result.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // categorizePackage
  // ---------------------------------------------------------------------------
  describe('categorizePackage', () => {
    it('should categorize core packages correctly', async () => {
      const { categorizePackage } = await import('../generate-package-deps.js');

      const corePackages = ['types', 'constants', 'utils', 'schema', 'errors'];
      for (const name of corePackages) {
        const category = categorizePackage(name);
        expect(category).toBe('core');
      }
    });

    it('should categorize feature packages correctly', async () => {
      const { categorizePackage } = await import('../generate-package-deps.js');

      const featurePackages = ['auth', 'core', 'events', 'i18n', 'tasks'];
      for (const name of featurePackages) {
        const category = categorizePackage(name);
        expect(category).toBe('feature');
      }

      // opa is infrastructure, not feature
      expect(categorizePackage('opa')).toBe('infrastructure');
    });

    it('should categorize infrastructure packages correctly', async () => {
      const { categorizePackage } = await import('../generate-package-deps.js');

      const category = categorizePackage('redis');
      expect(category).toBe('infrastructure');
    });

    it('should categorize db packages as infrastructure', async () => {
      const { categorizePackage } = await import('../generate-package-deps.js');

      expect(categorizePackage('db-core')).toBe('infrastructure');
      expect(categorizePackage('db-outbox')).toBe('infrastructure');
    });

    it('should categorize unknown packages as infrastructure', async () => {
      const { categorizePackage } = await import('../generate-package-deps.js');

      const category = categorizePackage('unknown-package');
      expect(category).toBe('infrastructure');
    });
  });

  // ---------------------------------------------------------------------------
  // generateMermaidDiagram
  // ---------------------------------------------------------------------------
  describe('generateMermaidDiagram', () => {
    it('should generate Mermaid flowchart syntax', async () => {
      const { generateMermaidDiagram } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [{ name: 'types', category: 'core', dependencies: [] }];

      const result = generateMermaidDiagram(mockNodes, []);
      expect(result).toContain('flowchart TD');
      expect(result).toContain('types');
    });

    it('should include subgraphs for categories', async () => {
      const { generateMermaidDiagram } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'types', category: 'core', dependencies: [] },
        { name: 'redis', category: 'infrastructure', dependencies: [] }
      ];

      const result = generateMermaidDiagram(mockNodes, []);
      expect(result).toContain('subgraph');
      expect(result).toContain('CORE');
      expect(result).toContain('INFRASTRUCTURE');
    });

    it('should generate edges for dependencies', async () => {
      const { generateMermaidDiagram } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'auth', category: 'feature', dependencies: ['types', 'utils'] },
        { name: 'types', category: 'core', dependencies: [] },
        { name: 'utils', category: 'core', dependencies: [] }
      ];

      const result = generateMermaidDiagram(mockNodes, []);
      expect(result).toContain('auth --> types');
      expect(result).toContain('auth --> utils');
    });

    it('should include circular dependency comments', async () => {
      const { generateMermaidDiagram } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'A', category: 'core', dependencies: ['B'] },
        { name: 'B', category: 'core', dependencies: ['A'] }
      ];

      const circular: [string, string][] = [['A', 'B']];

      const result = generateMermaidDiagram(mockNodes, circular);
      expect(result).toContain('CIRCULAR DEPENDENCIES');
      expect(result).toContain('A -> B');
    });

    it('should handle empty nodes list', async () => {
      const { generateMermaidDiagram } = await import('../generate-package-deps.js');

      const result = generateMermaidDiagram([], []);
      expect(result).toContain('flowchart TD');
    });

    it('should include @package/ prefix in node labels', async () => {
      const { generateMermaidDiagram } = await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [{ name: 'types', category: 'core', dependencies: [] }];

      const result = generateMermaidDiagram(mockNodes, []);
      expect(result).toContain('@package/types');
    });
  });

  // ---------------------------------------------------------------------------
  // generateMarkdownDoc
  // ---------------------------------------------------------------------------
  describe('generateMarkdownDoc', () => {
    it('should generate markdown with all sections', async () => {
      const { generateMarkdownDoc, generateMermaidDiagram } =
        await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'types', category: 'core', dependencies: [] },
        { name: 'redis', category: 'infrastructure', dependencies: ['core'] }
      ];

      const mermaid = generateMermaidDiagram(mockNodes, []);
      const result = generateMarkdownDoc(mockNodes, [], mermaid);

      expect(result).toContain('# Package Dependency Graph');
      expect(result).toContain('## Diagram');
      expect(result).toContain('## Legend');
      expect(result).toContain('## Mermaid Source');
      expect(result).toContain('## Package Summary');
      expect(result).toContain('## Statistics');
    });

    it('should include auto-generated comment header', async () => {
      const { generateMarkdownDoc, generateMermaidDiagram } =
        await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [{ name: 'types', category: 'core', dependencies: [] }];
      const mermaid = generateMermaidDiagram(mockNodes, []);

      const result = generateMarkdownDoc(mockNodes, [], mermaid);

      expect(result).toContain('<!-- AUTO-GENERATED FILE - DO NOT EDIT MANUALLY -->');
      expect(result).toContain('<!-- Generated by: pnpm run docs:package-deps -->');
    });

    it('should include PNG diagram reference', async () => {
      const { generateMarkdownDoc, generateMermaidDiagram } =
        await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [{ name: 'types', category: 'core', dependencies: [] }];
      const mermaid = generateMermaidDiagram(mockNodes, []);

      const result = generateMarkdownDoc(mockNodes, [], mermaid);

      expect(result).toContain('![Package Dependency Graph](../diagrams/png/package-deps.png)');
    });

    it('should embed Mermaid source in code block', async () => {
      const { generateMarkdownDoc, generateMermaidDiagram } =
        await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [{ name: 'types', category: 'core', dependencies: [] }];
      const mermaid = generateMermaidDiagram(mockNodes, []);

      const result = generateMarkdownDoc(mockNodes, [], mermaid);

      expect(result).toContain('```mermaid');
      expect(result).toContain('flowchart TD');
      expect(result).toContain('```');
    });

    it('should generate package summary table', async () => {
      const { generateMarkdownDoc, generateMermaidDiagram } =
        await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'types', category: 'core', dependencies: [] },
        { name: 'auth', category: 'feature', dependencies: ['types', 'utils'] }
      ];

      const mermaid = generateMermaidDiagram(mockNodes, []);
      const result = generateMarkdownDoc(mockNodes, [], mermaid);

      expect(result).toContain('| Package | Category | Dependencies |');
      expect(result).toContain('| @package/types | core | — |');
      expect(result).toContain('| @package/auth | feature | types, utils |');
    });

    it('should calculate statistics correctly', async () => {
      const { generateMarkdownDoc, generateMermaidDiagram } =
        await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'types', category: 'core', dependencies: [] },
        { name: 'auth', category: 'feature', dependencies: ['types'] },
        { name: 'redis', category: 'infrastructure', dependencies: ['core'] }
      ];

      const mermaid = generateMermaidDiagram(mockNodes, []);
      const result = generateMarkdownDoc(mockNodes, [], mermaid);

      expect(result).toContain('- **Total packages**: 3');
      expect(result).toContain('- **Total dependency edges**: 2');
      expect(result).toContain('- **Packages with no dependencies**: 1 (types)');
    });

    it('should show circular dependencies in statistics when present', async () => {
      const { generateMarkdownDoc, generateMermaidDiagram } =
        await import('../generate-package-deps.js');

      const mockNodes: IPackageNode[] = [
        { name: 'A', category: 'core', dependencies: ['B'] },
        { name: 'B', category: 'core', dependencies: ['A'] }
      ];

      const circular: [string, string][] = [['A', 'B']];
      const mermaid = generateMermaidDiagram(mockNodes, circular);

      const result = generateMarkdownDoc(mockNodes, circular, mermaid);

      expect(result).toContain('- **Circular dependencies**: 1');
    });
  });
});
