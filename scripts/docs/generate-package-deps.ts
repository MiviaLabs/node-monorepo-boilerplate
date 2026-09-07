/**
 * Generate package dependency diagram.
 *
 * Parses all packages in the `packages/` directory, extracts inter-package
 * dependencies from their package.json files, detects circular dependencies,
 * and generates a Mermaid flowchart showing the dependency graph.
 *
 * @example
 * ```bash
 * pnpm run docs:package-deps
 * ```
 *
 * @see .agents/docs/reference/diagrams/mermaid/package-deps.mmd - Generated output
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep, dirname, basename } from 'node:path';
import { globSync } from 'glob';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Directory containing all packages */
const PACKAGES_DIR = 'packages';

/** Output directory for Mermaid diagrams */
const MERMAID_DIR = '.agents/docs/reference/diagrams/mermaid';

/** Output file path for the package dependency diagram */
const MERMAID_FILE = join(MERMAID_DIR, 'package-deps.mmd');

/** Output directory for markdown documentation */
const DOCS_DIR = '.agents/docs/reference/packages';

/** Output file path for the dependency graph markdown */
const DOCS_FILE = join(DOCS_DIR, 'dependency-graph.md');

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

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/** Package category for subgraph grouping in the diagram */
type PackageCategory = 'core' | 'feature' | 'infrastructure';

/** Package node with metadata for building the dependency graph */
interface IPackageNode {
  /** Package name without @package/ prefix */
  name: string;
  /** Package category for subgraph grouping */
  category: PackageCategory;
  /** List of @package/* dependency names without prefix */
  dependencies: string[];
}

// =============================================================================
// DEPENDENCY PARSING
// =============================================================================

/**
 * Parse @package/* dependencies from a package.json file.
 *
 * Extracts dependencies and peerDependencies that start with `@package/`
 * and have version `workspace:*`. Returns the package names without the prefix.
 *
 * @param packageJsonPath - Absolute path to the package.json file
 * @returns Array of dependency names without @package/ prefix, sorted alphabetically
 *
 * @example
 * ```typescript
 * const deps = parsePackageDependencies('/packages/auth/package.json');
 * console.log(deps); // ['types', 'utils']
 * ```
 */
function parsePackageDependencies(packageJsonPath: string): string[] {
  const content = readFileSync(packageJsonPath, 'utf-8');
  let pkg: {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  try {
    pkg = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${packageJsonPath}: ${(error as Error).message}`);
  }

  const deps = pkg.dependencies ?? {};
  const peerDeps = pkg.peerDependencies ?? {};
  const allDeps = { ...deps, ...peerDeps };

  const starterDeps: string[] = [];

  for (const [name, version] of Object.entries(allDeps)) {
    if (name.startsWith('@package/') && version.startsWith('workspace:')) {
      starterDeps.push(name.replace('@package/', ''));
    }
  }

  return starterDeps.sort();
}

// =============================================================================
// CIRCULAR DEPENDENCY DETECTION
// =============================================================================

/**
 * Detect circular dependencies using depth-first search.
 *
 * Traverses the dependency graph and identifies cycles using a recursion stack.
 * Returns pairs of package names where a circular dependency was detected.
 *
 * @param nodes - Array of package nodes with their dependencies
 * @returns Array of [from, to] pairs indicating circular dependencies
 *
 * @example
 * ```typescript
 * const nodes = [
 *   { name: 'A', category: 'core', dependencies: ['B'] },
 *   { name: 'B', category: 'core', dependencies: ['A'] }
 * ];
 * const circular = detectCircularDependencies(nodes);
 * console.log(circular); // [['B', 'A']]
 * ```
 */
function detectCircularDependencies(nodes: IPackageNode[]): [string, string][] {
  const circular: [string, string][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  // Build a lookup map for faster node access
  const nodeMap = new Map<string, IPackageNode>();
  for (const node of nodes) {
    nodeMap.set(node.name, node);
  }

  function dfs(node: IPackageNode): void {
    visited.add(node.name);
    recStack.add(node.name);

    for (const dep of node.dependencies) {
      if (!visited.has(dep)) {
        const depNode = nodeMap.get(dep);
        if (depNode) {
          dfs(depNode);
        }
      } else if (recStack.has(dep)) {
        circular.push([node.name, dep]);
      }
    }

    recStack.delete(node.name);
  }

  for (const node of nodes) {
    if (!visited.has(node.name)) {
      dfs(node);
    }
  }

  return circular;
}

// =============================================================================
// PACKAGE CATEGORIZATION
// =============================================================================

/**
 * Categorize a package by its name.
 *
 * @param name - Package name without @package/ prefix
 * @returns Package category: 'core', 'feature', or 'infrastructure'
 *
 * @example
 * ```typescript
 * categorizePackage('types'); // 'core'
 * categorizePackage('auth'); // 'feature'
 * categorizePackage('redis'); // 'infrastructure'
 * ```
 */
function categorizePackage(name: string): PackageCategory {
  if ((CORE_PACKAGES as readonly string[]).includes(name)) {
    return 'core';
  }
  if ((FEATURE_PACKAGES as readonly string[]).includes(name)) {
    return 'feature';
  }
  return 'infrastructure';
}

// =============================================================================
// MERMAID DIAGRAM GENERATION
// =============================================================================

/**
 * Generate Mermaid flowchart from the dependency graph.
 *
 * Creates a Mermaid diagram with:
 * - Subgraphs for each package category (CORE, FEATURE, INFRASTRUCTURE)
 * - Nodes labeled with @package/{name}
 * - Edges showing dependency relationships
 * - Comments highlighting circular dependencies
 *
 * @param nodes - Array of package nodes
 * @param circular - Array of circular dependency pairs
 * @returns Mermaid flowchart syntax string
 *
 * @example
 * ```typescript
 * const nodes = [{ name: 'types', category: 'core', dependencies: [] }];
 * const mermaid = generateMermaidDiagram(nodes, []);
 * // flowchart TD
 * //     subgraph "CORE"
 * //         types["@package/types"]
 * //     end
 * ```
 */
function generateMermaidDiagram(nodes: IPackageNode[], circular: [string, string][]): string {
  const lines: string[] = ['flowchart TD'];

  // Group nodes by category
  const byCategory: Record<PackageCategory, IPackageNode[]> = {
    core: nodes.filter((n) => n.category === 'core'),
    feature: nodes.filter((n) => n.category === 'feature'),
    infrastructure: nodes.filter((n) => n.category === 'infrastructure')
  };

  // Generate subgraphs for each category
  const categoryOrder: PackageCategory[] = ['core', 'feature', 'infrastructure'];
  for (const category of categoryOrder) {
    const pkgs = byCategory[category];
    if (pkgs.length === 0) continue;

    lines.push(`    subgraph "${category.toUpperCase()}"`);
    for (const pkg of pkgs.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`        ${pkg.name}["@package/${pkg.name}"]`);
    }
    lines.push('    end');
  }

  // Generate edges for dependencies
  lines.push('');
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      lines.push(`    ${node.name} --> ${dep}`);
    }
  }

  // Add circular dependency warnings as comments
  if (circular.length > 0) {
    lines.push('');
    lines.push('    %% CIRCULAR DEPENDENCIES DETECTED:');
    for (const [from, to] of circular) {
      lines.push(`    %% ${from} -> ${to}`);
    }
  }

  return lines.join('\n') + '\n';
}

// =============================================================================
// MARKDOWN DOCUMENTATION GENERATION
// =============================================================================

/**
 * Generate markdown documentation with embedded Mermaid diagram.
 *
 * Creates a documentation page that includes:
 * - Diagram image reference (for PNG rendering)
 * - Mermaid source code block (for live preview)
 * - Package summary table
 * - Statistics
 *
 * @param nodes - Array of package nodes
 * @param circular - Array of circular dependency pairs
 * @param mermaidContent - Raw Mermaid diagram content
 * @returns Markdown documentation string
 */
function generateMarkdownDoc(
  nodes: IPackageNode[],
  circular: [string, string][],
  mermaidContent: string
): string {
  const lines: string[] = [];

  // Header
  lines.push('# Package Dependency Graph');
  lines.push('');
  lines.push('<!-- AUTO-GENERATED FILE - DO NOT EDIT MANUALLY -->');
  lines.push('<!-- Generated by: pnpm run docs:package-deps -->');
  lines.push('');
  lines.push(
    "This diagram shows the inter-package dependencies within the monorepo's `packages/` directory."
  );
  lines.push('');

  // Diagram reference
  lines.push('## Diagram');
  lines.push('');
  lines.push('![Package Dependency Graph](../diagrams/png/package-deps.png)');
  lines.push('');

  // Legend
  lines.push('## Legend');
  lines.push('');
  lines.push(
    '- **CORE subgraph**: Foundational packages with minimal dependencies (types, constants, utils, errors, schema)'
  );
  lines.push('- **FEATURE subgraph**: Business domain packages (auth, core, events, i18n, tasks)');
  lines.push(
    '- **INFRASTRUCTURE subgraph**: Technical capability packages (databases, caching, messaging, observability)'
  );
  lines.push('- **Arrows**: Package depends on target package (`A --> B` means A imports from B)');
  lines.push('');

  // Mermaid source
  lines.push('## Mermaid Source');
  lines.push('');
  lines.push('```mermaid');
  lines.push(mermaidContent.trim());
  lines.push('```');
  lines.push('');

  // Package summary table
  lines.push('## Package Summary');
  lines.push('');
  lines.push('| Package | Category | Dependencies |');
  lines.push('|---------|----------|--------------|');

  for (const node of nodes.sort((a, b) => a.name.localeCompare(b.name))) {
    const deps = node.dependencies.length > 0 ? node.dependencies.join(', ') : '—';
    lines.push(`| @package/${node.name} | ${node.category} | ${deps} |`);
  }
  lines.push('');

  // Statistics
  const totalEdges = nodes.reduce((sum, n) => sum + n.dependencies.length, 0);
  const noDeps = nodes.filter((n) => n.dependencies.length === 0);
  const mostDeps = [...nodes]
    .sort((a, b) => b.dependencies.length - a.dependencies.length)
    .slice(0, 3);

  lines.push('## Statistics');
  lines.push('');
  lines.push(`- **Total packages**: ${nodes.length}`);
  lines.push(`- **Total dependency edges**: ${totalEdges}`);
  lines.push(`- **Circular dependencies**: ${circular.length}`);
  lines.push(
    `- **Packages with no dependencies**: ${noDeps.length} (${noDeps.map((n) => n.name).join(', ')})`
  );
  lines.push(
    `- **Most dependencies**: ${mostDeps.map((n) => `${n.name} (${n.dependencies.length})`).join(', ')}`
  );
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Main function to generate the package dependency diagram.
 *
 * 1. Scans the packages/ directory for all package.json files
 * 2. Parses @package/* dependencies from each package
 * 3. Categorizes packages into core/feature/infrastructure
 * 4. Detects circular dependencies
 * 5. Generates a Mermaid flowchart diagram
 * 6. Writes the Mermaid output to .agents/docs/reference/diagrams/mermaid/package-deps.mmd
 * 7. Writes the markdown documentation to .agents/docs/reference/packages/dependency-graph.md
 */
async function main(): Promise<void> {
  console.log('Generating package dependency diagram...\n');

  // Find all package.json files
  const pattern = join(PACKAGES_DIR, '*/package.json');
  const packageJsonFiles = globSync(pattern).sort((a, b) => a.localeCompare(b));

  console.log(`Found ${packageJsonFiles.length} packages`);

  // Build dependency graph
  const nodes: IPackageNode[] = [];
  for (const file of packageJsonFiles) {
    // Use dirname/basename for cross-platform compatibility
    // globSync returns paths with forward slashes on all platforms
    // Normalize to use the platform separator for dirname
    const packageDir = dirname(file.replace(/\//g, sep));
    const name = basename(packageDir);
    const dependencies = parsePackageDependencies(file);
    const category = categorizePackage(name);

    nodes.push({ name, category, dependencies });
    console.log(`  ✓ ${name} (${dependencies.length} deps)`);
  }

  console.log(`\nParsed ${nodes.length} packages`);

  // Detect circular dependencies
  const circular = detectCircularDependencies(nodes);
  if (circular.length > 0) {
    console.warn(`\n⚠️  Warning: ${circular.length} circular dependencies detected:`);
    for (const [from, to] of circular) {
      console.warn(`  ${from} → ${to}`);
    }
  }

  // Generate Mermaid diagram
  const mermaid = generateMermaidDiagram(nodes, circular);

  // Ensure Mermaid output directory exists
  if (!existsSync(MERMAID_DIR)) {
    mkdirSync(MERMAID_DIR, { recursive: true });
  }

  // Write Mermaid output
  writeFileSync(MERMAID_FILE, mermaid, 'utf-8');

  // Generate markdown documentation
  const markdown = generateMarkdownDoc(nodes, circular, mermaid);

  // Ensure docs output directory exists
  if (!existsSync(DOCS_DIR)) {
    mkdirSync(DOCS_DIR, { recursive: true });
  }

  // Write markdown documentation
  writeFileSync(DOCS_FILE, markdown, 'utf-8');

  // Summary
  const totalEdges = nodes.reduce((sum, n) => sum + n.dependencies.length, 0);
  console.log(`\n✓ Generated: ${MERMAID_FILE}`);
  console.log(`✓ Generated: ${DOCS_FILE}`);
  console.log(`  Total nodes: ${nodes.length}`);
  console.log(`  Total edges: ${totalEdges}`);
  console.log(`  Circular deps: ${circular.length}`);
}

// =============================================================================
// EXPORTS (for unit testing)
// =============================================================================
export {
  parsePackageDependencies,
  detectCircularDependencies,
  categorizePackage,
  generateMermaidDiagram,
  generateMarkdownDoc
};
export type { IPackageNode, PackageCategory };

// Module guard - only run main() when executed directly
// Note: Using require.main for tsx compatibility. For ESM-only runtimes,
// consider updating to: if (process.argv[1] === fileURLToPath(import.meta.url))
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
