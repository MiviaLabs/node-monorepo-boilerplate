/**
 * Unit tests for generate-package-index.ts script.
 *
 * Tests package categorization, metadata extraction, export counting,
 * and markdown table generation.
 *
 * @see scripts/docs/generate-package-index.ts
 */

import { jest } from '@jest/globals';
import * as path from 'node:path';

// Mock node:fs/promises before importing the module under test
const mockReadFile: jest.MockedFunction<() => Promise<string>> = jest.fn();
const mockReaddir: jest.MockedFunction<() => Promise<string[]>> = jest.fn();
const mockMkdir: jest.MockedFunction<() => Promise<void>> = jest.fn();
const mockWriteFile: jest.MockedFunction<() => Promise<void>> = jest.fn();

jest.mock('node:fs/promises', () => ({
  readFile: () => mockReadFile(),
  readdir: () => mockReaddir(),
  mkdir: () => mockMkdir(),
  writeFile: () => mockWriteFile()
}));

// Import actual functions and types from the implementation
import {
  categorizePackage,
  extractPackageMetadata,
  countExports,
  generateMarkdownTable
} from '../generate-package-index';
import type { IPackageMetadata } from '../generate-package-index';

// =============================================================================
// TEST SUITES
// =============================================================================

describe('generate-package-index', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // categorizePackage
  // ---------------------------------------------------------------------------
  describe('categorizePackage', () => {
    it('should classify "types" as core', () => {
      expect(categorizePackage('types')).toBe('core');
    });

    it('should classify "constants" as core', () => {
      expect(categorizePackage('constants')).toBe('core');
    });

    it('should classify "utils" as core', () => {
      expect(categorizePackage('utils')).toBe('core');
    });

    it('should classify "errors" as core', () => {
      expect(categorizePackage('errors')).toBe('core');
    });

    it('should classify "auth" as feature', () => {
      expect(categorizePackage('auth')).toBe('feature');
    });

    it('should classify "core" as feature', () => {
      expect(categorizePackage('core')).toBe('feature');
    });

    it('should classify "schema" as core', () => {
      expect(categorizePackage('schema')).toBe('core');
    });

    it('should classify "i18n" as feature', () => {
      expect(categorizePackage('i18n')).toBe('feature');
    });

    it('should classify "events" as feature', () => {
      expect(categorizePackage('events')).toBe('feature');
    });

    it('should classify "tasks" as feature', () => {
      expect(categorizePackage('tasks')).toBe('feature');
    });

    it('should classify "db-core" as infrastructure', () => {
      expect(categorizePackage('db-core')).toBe('infrastructure');
    });

    it('should classify "db-outbox" as infrastructure', () => {
      expect(categorizePackage('db-outbox')).toBe('infrastructure');
    });

    it('should classify "redis" as infrastructure', () => {
      expect(categorizePackage('redis')).toBe('infrastructure');
    });

    it('should classify "queues" as infrastructure', () => {
      expect(categorizePackage('queues')).toBe('infrastructure');
    });

    it('should classify "pubsub" as infrastructure', () => {
      expect(categorizePackage('pubsub')).toBe('infrastructure');
    });

    it('should classify "observability" as infrastructure', () => {
      expect(categorizePackage('observability')).toBe('infrastructure');
    });

    it('should classify "secrets" as infrastructure', () => {
      expect(categorizePackage('secrets')).toBe('infrastructure');
    });

    it('should classify "encryption" as infrastructure', () => {
      expect(categorizePackage('encryption')).toBe('infrastructure');
    });

    it('should classify "opa" as infrastructure', () => {
      expect(categorizePackage('opa')).toBe('infrastructure');
    });

    it('should classify "test-utils" as infrastructure', () => {
      expect(categorizePackage('test-utils')).toBe('infrastructure');
    });

    it('should classify unknown packages as domain', () => {
      expect(categorizePackage('unknown-package')).toBe('domain');
    });

    it('should classify empty string as domain', () => {
      expect(categorizePackage('')).toBe('domain');
    });
  });

  // ---------------------------------------------------------------------------
  // extractPackageMetadata
  // ---------------------------------------------------------------------------
  describe('extractPackageMetadata', () => {
    it('should extract name from package.json', async () => {
      const mockPackageJson = {
        name: '@package/types',
        description: 'Shared types',
        version: '1.0.0',
        dependencies: {}
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/types');

      expect(result.name).toBe('types');
      expect(result.displayName).toBe('@package/types');
    });

    it('should extract description from package.json', async () => {
      const mockPackageJson = {
        name: '@package/utils',
        description: 'Utility functions',
        version: '1.0.0',
        dependencies: {}
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/utils');

      expect(result.description).toBe('Utility functions');
    });

    it('should extract version from package.json', async () => {
      const mockPackageJson = {
        name: '@package/auth',
        description: 'Auth package',
        version: '2.3.4',
        dependencies: {}
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/auth');

      expect(result.version).toBe('2.3.4');
    });

    it('should extract @package dependencies only', async () => {
      const mockPackageJson = {
        name: '@package/core',
        description: 'Core package',
        version: '1.0.0',
        dependencies: {
          '@package/types': '^1.0.0',
          '@package/utils': '^1.0.0',
          lodash: '^4.17.21',
          typescript: '^5.0.0'
        }
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/core');

      expect(result.dependencies).toEqual(['@package/types', '@package/utils']);
      expect(result.dependencies).not.toContain('lodash');
      expect(result.dependencies).not.toContain('typescript');
    });

    it('should handle missing description field', async () => {
      const mockPackageJson = {
        name: '@package/minimal',
        version: '1.0.0'
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/minimal');

      expect(result.description).toBe('');
    });

    it('should handle missing version field', async () => {
      const mockPackageJson = {
        name: '@package/minimal',
        description: 'Minimal package'
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/minimal');

      expect(result.version).toBe('0.0.0');
    });

    it('should handle missing dependencies field', async () => {
      const mockPackageJson = {
        name: '@package/standalone',
        description: 'Standalone package',
        version: '1.0.0'
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/standalone');

      expect(result.dependencies).toEqual([]);
    });

    it('should include the package path', async () => {
      const mockPackageJson = {
        name: '@package/types',
        description: 'Types',
        version: '1.0.0'
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/types');

      expect(result.path).toBe('/packages/types');
    });

    it('should set category based on package name', async () => {
      const mockPackageJson = {
        name: '@package/redis',
        description: 'Redis client',
        version: '1.0.0'
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      const result = await extractPackageMetadata('/packages/redis');

      expect(result.category).toBe('infrastructure');
    });

    it('should throw when name field is missing', async () => {
      const mockPackageJson = {
        description: 'No name',
        version: '1.0.0'
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      await expect(extractPackageMetadata('/packages/bad')).rejects.toThrow(
        "missing required 'name' field"
      );
    });

    it('should throw on malformed JSON', async () => {
      mockReadFile.mockResolvedValue('{ invalid json }');

      await expect(extractPackageMetadata('/packages/bad')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // countExports
  // ---------------------------------------------------------------------------
  describe('countExports', () => {
    it('should return number for valid file', () => {
      // Uses real ts-morph - test with actual package
      // Use path.resolve() for portability across environments
      const projectRoot = path.resolve(__dirname, '../../..');
      const count = countExports(path.join(projectRoot, 'packages/types/src/index.ts'));
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle non-existent file gracefully', () => {
      const count = countExports('/packages/nonexistent/src/index.ts');
      expect(count).toBe(0);
    });

    it('should return 0 for invalid path', () => {
      const count = countExports('/this/path/does/not/exist.ts');
      expect(count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // generateMarkdownTable
  // ---------------------------------------------------------------------------
  describe('generateMarkdownTable', () => {
    it('should generate valid markdown table header', () => {
      const packages: IPackageMetadata[] = [
        {
          name: 'types',
          displayName: '@package/types',
          description: 'Shared types',
          version: '1.0.0',
          category: 'core',
          dependencies: [],
          path: '/packages/types',
          exportCount: 10
        }
      ];

      const result = generateMarkdownTable(packages);

      expect(result).toContain('| Package | Purpose | Exports | Link |');
      expect(result).toContain('|---------|---------|---------|------|');
    });

    it('should include all columns (Package, Purpose, Exports, Link)', () => {
      const packages: IPackageMetadata[] = [
        {
          name: 'utils',
          displayName: '@package/utils',
          description: 'Utility functions',
          version: '1.0.0',
          category: 'core',
          dependencies: [],
          path: '/packages/utils',
          exportCount: 25
        }
      ];

      const result = generateMarkdownTable(packages);

      expect(result).toContain('@package/utils');
      expect(result).toContain('Utility functions');
      expect(result).toContain('25');
      expect(result).toContain('[docs](./utils/src.md)');
    });

    it('should handle empty package list', () => {
      const result = generateMarkdownTable([]);

      expect(result).toContain('No packages in this category');
    });

    it('should escape special markdown characters', () => {
      const packages: IPackageMetadata[] = [
        {
          name: 'special',
          displayName: '@package/special',
          description: 'Contains | pipe and other special chars',
          version: '1.0.0',
          category: 'core',
          dependencies: [],
          path: '/packages/special',
          exportCount: 5
        }
      ];

      const result = generateMarkdownTable(packages);

      // Pipe should be escaped
      expect(result).not.toMatch(/Contains \| pipe/);
      expect(result).toContain('Contains \\| pipe');
    });

    it('should sort packages alphabetically', () => {
      const packages: IPackageMetadata[] = [
        {
          name: 'utils',
          displayName: '@package/utils',
          description: 'Utils',
          version: '1.0.0',
          category: 'core',
          dependencies: [],
          path: '/packages/utils',
          exportCount: 10
        },
        {
          name: 'auth',
          displayName: '@package/auth',
          description: 'Auth',
          version: '1.0.0',
          category: 'feature',
          dependencies: [],
          path: '/packages/auth',
          exportCount: 5
        },
        {
          name: 'core',
          displayName: '@package/core',
          description: 'Core',
          version: '1.0.0',
          category: 'feature',
          dependencies: [],
          path: '/packages/core',
          exportCount: 15
        }
      ];

      const result = generateMarkdownTable(packages);
      const authIndex = result.indexOf('@package/auth');
      const coreIndex = result.indexOf('@package/core');
      const utilsIndex = result.indexOf('@package/utils');

      expect(authIndex).toBeLessThan(coreIndex);
      expect(coreIndex).toBeLessThan(utilsIndex);
    });

    it('should display em-dash for missing export count', () => {
      const packages: IPackageMetadata[] = [
        {
          name: 'no-exports',
          displayName: '@package/no-exports',
          description: 'No exports counted',
          version: '1.0.0',
          category: 'domain',
          dependencies: [],
          path: '/packages/no-exports'
          // exportCount intentionally omitted
        }
      ];

      const result = generateMarkdownTable(packages);

      expect(result).toContain('—'); // em-dash for missing value
    });
  });
});
