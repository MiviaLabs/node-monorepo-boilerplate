/**
 * Generate a unified package index/overview for the monorepo.
 *
 * This script scans all packages in the `packages/` directory, extracts metadata
 * from their package.json files, counts exports, and generates a categorized
 * markdown table at `.agents/docs/reference/packages/README.md`.
 *
 * @example
 * ```bash
 * pnpm run docs:package-index
 * ```
 *
 * @see .agents/docs/reference/packages/README.md - Generated output
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { Project } from 'ts-morph';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Directory containing all packages */
const PACKAGES_DIR = 'packages';

/** Output path for the generated index */
const OUTPUT_PATH = '.agents/docs/reference/packages/README.md';

/**
 * Core packages that provide foundational types, utilities, and constants.
 * These packages have no or minimal dependencies and are used by most other packages.
 */
const CORE_PACKAGES = ['types', 'constants', 'utils', 'errors', 'schema'] as const;

/**
 * Feature packages that implement business domain functionality.
 * These packages build on core packages to provide specific features.
 */
const FEATURE_PACKAGES = ['auth', 'core', 'i18n', 'events', 'tasks'] as const;

/**
 * Infrastructure packages that provide technical capabilities.
 * These packages handle database, caching, messaging, and observability concerns.
 */
const INFRASTRUCTURE_PACKAGES = [
  'db-core',
  'db-outbox',
  'redis',
  'queues',
  'pubsub',
  'observability',
  'opa',
  'secrets',
  'encryption',
  'test-utils'
] as const;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Package category for organizing packages in documentation.
 */
type PackageCategory = 'core' | 'feature' | 'infrastructure' | 'domain';

/**
 * Metadata extracted from a package's package.json.
 */
interface IPackageMetadata {
  /** Package name without @package/ prefix */
  name: string;
  /** Full package name with @package/ prefix */
  displayName: string;
  /** Package description */
  description: string;
  /** Package version */
  version: string;
  /** Package category */
  category: PackageCategory;
  /** List of @package/* dependencies */
  dependencies: string[];
  /** Absolute path to the package directory */
  path: string;
  /** Number of exports from src/index.ts */
  exportCount?: number;
}

// =============================================================================
// CATEGORIZATION
// =============================================================================

/**
 * Categorize a package by its name.
 *
 * @param name - Package name without @package/ prefix
 * @returns Package category
 *
 * @example
 * ```typescript
 * categorizePackage('types'); // 'core'
 * categorizePackage('auth'); // 'feature'
 * categorizePackage('redis'); // 'infrastructure'
 * categorizePackage('custom'); // 'domain'
 * ```
 */
export function categorizePackage(name: string): PackageCategory {
  if ((CORE_PACKAGES as readonly string[]).includes(name)) {
    return 'core';
  }
  if ((FEATURE_PACKAGES as readonly string[]).includes(name)) {
    return 'feature';
  }
  if ((INFRASTRUCTURE_PACKAGES as readonly string[]).includes(name)) {
    return 'infrastructure';
  }
  return 'domain';
}

// =============================================================================
// METADATA EXTRACTION
// =============================================================================

/**
 * Extract description from CLAUDE.md file.
 *
 * Reads the first non-heading, non-empty line after the title as the description.
 *
 * @param packagePath - Absolute path to the package directory
 * @returns Description string or empty string if not found
 */
async function extractDescriptionFromClaudeMd(packagePath: string): Promise<string> {
  const agentsMdPath = path.join(packagePath, 'AGENTS.md');
  const claudeMdPath = path.join(packagePath, 'CLAUDE.md');
  const targetPath = existsSync(agentsMdPath) ? agentsMdPath : claudeMdPath;

  if (!existsSync(targetPath)) {
    return '';
  }

  try {
    const content = await fs.readFile(targetPath, 'utf-8');
    const lines = content.split('\n');

    // Skip the title (# @package/package-name) and find first content line
    for (let i = 1; i < lines.length && i < 20; i++) {
      const line = lines[i]?.trim();
      // Skip empty lines, section headers, code blocks, table rows, and table separators
      if (
        line &&
        !line.startsWith('#') &&
        !line.startsWith('```') &&
        !line.startsWith('|') &&
        !line.startsWith('---') &&
        !line.startsWith('@')
      ) {
        return line;
      }
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Extract metadata from a package's package.json.
 *
 * Falls back to reading description from CLAUDE.md if not in package.json.
 *
 * @param packagePath - Absolute path to the package directory
 * @returns Package metadata object
 * @throws Error if package.json cannot be read or parsed
 *
 * @example
 * ```typescript
 * const metadata = await extractPackageMetadata('/path/to/packages/types');
 * console.log(metadata.name); // 'types'
 * console.log(metadata.displayName); // '@package/types'
 * ```
 */
export async function extractPackageMetadata(packagePath: string): Promise<IPackageMetadata> {
  const packageJsonPath = path.join(packagePath, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(content) as {
    name: string;
    description?: string;
    version?: string;
    dependencies?: Record<string, string>;
  };

  if (!pkg.name) {
    throw new Error(`Package ${packagePath} is missing required 'name' field in package.json`);
  }

  const name = pkg.name.replace('@package/', '');

  // Try package.json description first, fallback to CLAUDE.md
  let description = pkg.description ?? '';
  if (!description) {
    description = await extractDescriptionFromClaudeMd(packagePath);
  }

  return {
    name,
    displayName: pkg.name,
    description,
    version: pkg.version ?? '0.0.0',
    category: categorizePackage(name),
    dependencies: Object.keys(pkg.dependencies ?? {}).filter((dep) => dep.startsWith('@package/')),
    path: packagePath
  };
}

// =============================================================================
// EXPORT COUNTING
// =============================================================================

/**
 * Count the number of exports from a package's src/index.ts.
 *
 * Provides an approximate count of public API surface for documentation purposes.
 * Counts different types of exports separately to avoid most double-counting:
 *
 * - Named exports: `export { foo, bar }` (from getExportDeclarations)
 * - Re-exports: `export * from './module'` (counts re-exported module's exports)
 * - Export assignments: `export default foo` (from getDefaultExportSymbol)
 * - Exported declarations: `export const foo = ...` (from getStatements with isExported)
 *
 * Note: This is an approximate count for documentation, not an exact metric.
 * Re-exported modules' exports are counted recursively, which may include
 * both export declarations and exported statements from the target module.
 *
 * @param indexPath - Path to the package's src/index.ts
 * @returns Number of exported symbols, or 0 if file doesn't exist
 *
 * @example
 * ```typescript
 * const count = countExports('/path/to/packages/types/src/index.ts');
 * console.log(count); // 42
 * ```
 */
export function countExports(indexPath: string): number {
  if (!existsSync(indexPath)) {
    return 0;
  }

  try {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true
    });
    const sourceFile = project.addSourceFileAtPath(indexPath);

    let count = 0;

    // Count export declarations: export { foo, bar } or export * from './module'
    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const namedExports = exportDecl.getNamedExports();
      if (namedExports.length > 0) {
        count += namedExports.length;
      } else if (exportDecl.getModuleSpecifier()) {
        // Re-export all: export * from './module'
        // Resolve the module to count actual exported symbols
        const moduleSpecifier = exportDecl.getModuleSpecifier();
        if (moduleSpecifier) {
          try {
            const moduleSourceFile = exportDecl.getModuleSpecifierSourceFile();
            if (moduleSourceFile) {
              // Count all exports from the re-exported module
              for (const exportDecl of moduleSourceFile.getExportDeclarations()) {
                const moduleNamedExports = exportDecl.getNamedExports();
                if (moduleNamedExports.length > 0) {
                  count += moduleNamedExports.length;
                } else if (exportDecl.getModuleSpecifier()) {
                  // Nested export * - count as 1 to avoid infinite recursion
                  count += 1;
                }
              }
              // Count exported declarations in the module
              for (const stmt of moduleSourceFile.getStatements()) {
                if ('isExported' in stmt && typeof stmt.isExported === 'function') {
                  if ((stmt as { isExported: () => boolean }).isExported()) {
                    count += 1;
                  }
                }
              }
              // Count default export
              if (moduleSourceFile.getDefaultExportSymbol()) {
                count += 1;
              }
            } else {
              // Module could not be resolved - count as 1
              count += 1;
            }
          } catch {
            // If resolution fails, count as 1
            count += 1;
          }
        }
      }
    }

    // Count default export
    if (sourceFile.getDefaultExportSymbol()) {
      count += 1;
    }

    // Count exported variable/function/class declarations
    for (const stmt of sourceFile.getStatements()) {
      // Check if statement has export keyword
      if ('isExported' in stmt && typeof stmt.isExported === 'function') {
        if ((stmt as { isExported: () => boolean }).isExported()) {
          count += 1;
        }
      }
    }

    return count;
  } catch (error) {
    console.warn(`Failed to count exports in ${indexPath}:`, error);
    return 0;
  }
}

// =============================================================================
// MARKDOWN GENERATION
// =============================================================================

/**
 * Escape special markdown characters in a string.
 *
 * @param text - Text to escape
 * @returns Escaped text safe for markdown tables
 */
function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

/**
 * Generate a markdown table for a list of packages.
 *
 * @param packages - Array of package metadata
 * @returns Markdown table string
 *
 * @example
 * ```typescript
 * const table = generateMarkdownTable(packages);
 * // | Package | Purpose | Exports | Link |
 * // |---------|---------|---------|------|
 * // | @package/types | Shared types | 42 | [docs](./types/) |
 * ```
 */
export function generateMarkdownTable(packages: IPackageMetadata[]): string {
  if (packages.length === 0) {
    return '*No packages in this category.*\n';
  }

  const header = '| Package | Purpose | Exports | Link |\n';
  const separator = '|---------|---------|---------|------|\n';

  const rows = packages
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((pkg) => {
      const name = pkg.displayName;
      const purpose = escapeMarkdown(pkg.description);
      const exports = pkg.exportCount ?? '—';
      // Link to src.md (TypeDoc generates modules as src.md, not README.md)
      const link = `[docs](./${pkg.name}/src.md)`;
      return `| ${name} | ${purpose} | ${exports} | ${link} |`;
    })
    .join('\n');

  return header + separator + rows + '\n';
}

// =============================================================================
// DETERMINISTIC DATE
// =============================================================================

/**
 * Get a deterministic date string for reproducible builds.
 *
 * Reads the SOURCE_DATE_EPOCH environment variable (Unix timestamp).
 * If set, converts to YYYY-MM-DD format. Otherwise, returns a placeholder
 * that indicates this is auto-generated content without embedding timestamps.
 *
 * This enables reproducible documentation generation in CI/CD pipelines.
 *
 * @returns Date string or placeholder for auto-generated content
 *
 * @example
 * ```bash
 * SOURCE_DATE_EPOCH=1609459200 pnpm run docs:package-index
 * # Produces: "> Auto-generated on 2021-01-01"
 * ```
 */
function getDeterministicDate(): string {
  const sourceDateEpoch = process.env['SOURCE_DATE_EPOCH'];
  if (sourceDateEpoch) {
    const timestamp = parseInt(sourceDateEpoch, 10) * 1000;
    const dateStr = new Date(timestamp).toISOString().split('T')[0];
    return dateStr ?? '';
  }
  // Return empty string to avoid embedding non-deterministic timestamps
  return '';
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Main function to generate the package index.
 *
 * 1. Scans the packages/ directory for all packages
 * 2. Extracts metadata from each package's package.json
 * 3. Counts exports from each package's src/index.ts
 * 4. Groups packages by category
 * 5. Generates a markdown document with categorized tables
 * 6. Writes the output to .agents/docs/reference/packages/README.md
 */
async function main(): Promise<void> {
  console.log('Generating package index...');

  // Find all packages
  const packagesPath = path.join(process.cwd(), PACKAGES_DIR);
  const entries = await fs.readdir(packagesPath, { withFileTypes: true });
  const packageDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(packagesPath, e.name));

  console.log(`Found ${packageDirs.length} packages`);

  // Extract metadata
  const packages: IPackageMetadata[] = [];
  for (const dir of packageDirs) {
    try {
      const metadata = await extractPackageMetadata(dir);
      const indexPath = path.join(dir, 'src', 'index.ts');
      metadata.exportCount = countExports(indexPath);
      packages.push(metadata);
      console.log(`  ✓ ${metadata.displayName} (${metadata.exportCount} exports)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗ Skipping ${path.basename(dir)}: ${message}`);
    }
  }

  // Group by category
  const byCategory = new Map<PackageCategory, IPackageMetadata[]>();
  for (const pkg of packages) {
    const list = byCategory.get(pkg.category) ?? [];
    list.push(pkg);
    byCategory.set(pkg.category, list);
  }

  // Generate markdown
  let markdown = '# Package Reference\n\n';
  const dateStr = getDeterministicDate();
  if (dateStr) {
    markdown += `> Auto-generated on ${dateStr}\n\n`;
  } else {
    markdown += '> Auto-generated by `docs:package-index` script\n\n';
  }
  markdown += 'This document provides an overview of all packages in the monorepo.\n\n';

  const categories: [PackageCategory, string][] = [
    ['core', 'Core Packages'],
    ['feature', 'Feature Packages'],
    ['infrastructure', 'Infrastructure Packages'],
    ['domain', 'Domain Packages']
  ];

  for (const [category, title] of categories) {
    const pkgs = byCategory.get(category) ?? [];
    if (pkgs.length > 0) {
      markdown += `## ${title}\n\n`;
      markdown += generateMarkdownTable(pkgs);
      markdown += '\n';
    }
  }

  // Write output
  const outputPath = path.join(process.cwd(), OUTPUT_PATH);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, markdown);

  console.log(`\n✓ Generated ${OUTPUT_PATH} with ${packages.length} packages`);
}

// =============================================================================
// TYPE EXPORTS (for unit testing)
// =============================================================================
export type { IPackageMetadata, PackageCategory };

// Module guard - only run main() when executed directly
// Note: Using require.main for tsx compatibility. For ESM-only runtimes,
// consider updating to: if (process.argv[1] === fileURLToPath(import.meta.url))
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
