/**
 * Generate Module Dependency Graph from NestJS @Module decorators.
 *
 * This script uses ts-morph to parse TypeScript files and extract module
 * definitions, imports, exports, and dependencies to generate a Mermaid
 * flowchart showing the module dependency graph.
 *
 * @example
 * ```bash
 * npx tsx scripts/docs/generate-module-deps.ts
 * ```
 *
 * @module scripts/docs/generate-module-deps
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import {
  ModuleKind,
  ModuleResolutionKind,
  Project,
  ScriptTarget,
  SyntaxKind,
  type ClassDeclaration,
  type Decorator,
  type SourceFile
} from 'ts-morph';

// ============================================
// TYPES AND INTERFACES
// ============================================

/**
 * Module category for grouping in the diagram.
 */
type ModuleCategory = 'infrastructure' | 'feature' | 'i18n' | 'external';

/**
 * Module node representing a parsed NestJS module.
 */
interface IModuleNode {
  /** Module class name (e.g., 'UsersModule') */
  name: string;
  /** Relative file path from repository root */
  filePath: string;
  /** Array of imported module names */
  imports: string[];
  /** Array of exported module names */
  exports: string[];
  /** Whether the module has @Global() decorator */
  isGlobal: boolean;
  /** Whether the module uses forwardRef */
  hasForwardRef: boolean;
  /** Whether the module is dynamic (forRoot, forRootAsync, register) */
  isDynamic: boolean;
  /** Module category for diagram grouping */
  category: ModuleCategory;
}

/**
 * Circular dependency between two modules.
 */
interface ICircularDependency {
  /** First module in the circular dependency */
  moduleA: string;
  /** Second module in the circular dependency */
  moduleB: string;
}

/**
 * Result of parsing a single module file.
 */
interface IModuleParseResult {
  /** Path to the parsed file */
  file: string;
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed module node if successful */
  module?: IModuleNode;
  /** Error message if parsing failed */
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Root directory to scan for NestJS modules.
 */
const MODULE_ROOT = 'apps/api/src';

/**
 * Pattern for module files.
 */
const MODULE_PATTERN = '.module.ts';

/**
 * Output paths for generated files.
 */
const MERMAID_OUTPUT_PATH = '.agents/docs/reference/diagrams/mermaid/module-deps.mmd';
const MARKDOWN_OUTPUT_PATH = '.agents/docs/reference/modules/dependency-graph.md';

/**
 * Infrastructure module names (marked as @Global or core infrastructure).
 */
const INFRASTRUCTURE_MODULES = new Set([
  'AppModule',
  'AppConfigModule',
  'DatabaseModule',
  'VersionModule',
  'InfrastructureModule',
  'ApiKeysModule'
]);

/**
 * Feature module names.
 */
const FEATURE_MODULES = new Set([
  'AuthModule',
  'HealthModule',
  'SecurityModule',
  'ProjectsModule',
  'EncryptedStoreModule',
  'SystemModule',
  'TenantsModule',
  'UsersModule'
]);

/**
 * i18n module names.
 */
const I18N_MODULES = new Set(['ErrorI18nModule']);

/**
 * External modules that come from packages (not defined in the codebase).
 */
const EXTERNAL_MODULES = new Set([
  'CqrsModule',
  'ThrottlerModule',
  'ObservabilityModule',
  'EventsModule',
  'EncryptionModule',
  'RedisModule',
  'ConfigModule',
  'OutboxDbModule'
]);

// ============================================
// TS-MORPH PROJECT SETUP
// ============================================

/**
 * Initializes the ts-morph Project with workspace tsconfig.
 *
 * @returns Configured ts-morph Project instance
 */
function createProject(): Project {
  const tsconfigPath = 'tsconfig.base.json';

  if (!existsSync(tsconfigPath)) {
    console.warn(`Warning: ${tsconfigPath} not found, using default compiler options`);
    return new Project({
      compilerOptions: {
        target: ScriptTarget.ES2015,
        module: ModuleKind.ESNext,
        moduleResolution: ModuleResolutionKind.Node10,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true
      }
    });
  }

  return new Project({
    tsConfigFilePath: tsconfigPath
  });
}

// ============================================
// FILE DISCOVERY
// ============================================

/**
 * Recursively discovers all module files in the given directory.
 *
 * @param dir - Directory to scan
 * @returns Array of relative paths to module files
 */
function discoverModuleFilesInDir(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and test directories
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'test') {
        continue;
      }
      files.push(...discoverModuleFilesInDir(fullPath));
    } else if (entry.endsWith(MODULE_PATTERN)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Discovers all module files across the API source directory.
 *
 * @returns Array of relative paths to module files
 */
function discoverModuleFiles(): string[] {
  const files = discoverModuleFilesInDir(MODULE_ROOT);
  return files.sort((a, b) => a.localeCompare(b));
}

// ============================================
// MODULE PARSING
// ============================================

/**
 * Checks if a class has the @Global() decorator.
 *
 * @param classDecl - The class declaration to check
 * @returns True if the class has @Global() decorator
 */
function hasGlobalDecorator(classDecl: ClassDeclaration): boolean {
  const decorators = classDecl.getDecorators();

  for (const decorator of decorators) {
    if (decorator.getName() === 'Global') {
      return true;
    }
  }

  return false;
}

/**
 * Determines if a module name is an infrastructure module.
 *
 * @param name - Module name
 * @param isGlobal - Whether the module has @Global() decorator
 * @returns True if the module is an infrastructure module
 */
function isInfraModule(name: string, isGlobal: boolean): boolean {
  return INFRASTRUCTURE_MODULES.has(name) || isGlobal;
}

/**
 * Determines if a module name is a feature module.
 *
 * @param name - Module name
 * @returns True if the module is a feature module
 */
function isFeatureModule(name: string): boolean {
  return FEATURE_MODULES.has(name);
}

/**
 * Categorizes a module based on its name and properties.
 *
 * @param name - Module name
 * @param isGlobal - Whether the module has @Global() decorator
 * @returns Module category
 */
function categorizeModule(name: string, isGlobal: boolean): ModuleCategory {
  if (I18N_MODULES.has(name)) {
    return 'i18n';
  }

  if (EXTERNAL_MODULES.has(name)) {
    return 'external';
  }

  if (isInfraModule(name, isGlobal)) {
    return 'infrastructure';
  }

  if (isFeatureModule(name)) {
    return 'feature';
  }

  // Default to feature for unknown modules
  return 'feature';
}

/**
 * Extracts the module name from an import expression.
 *
 * Handles patterns:
 * - Direct import: ModuleName
 * - forwardRef: forwardRef(() => ModuleName)
 * - Dynamic module: ModuleName.forRoot(), ModuleName.forRootAsync(), ModuleName.register()
 * - Spread: ...(condition ? [Module] : [])
 *
 * @param text - The text of the import expression
 * @returns Object with module name and flags
 */
function extractModuleName(text: string): {
  name: string;
  hasForwardRef: boolean;
  isDynamic: boolean;
} | null {
  // Remove whitespace for easier matching
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Check for spread patterns (skip these as they are conditional)
  if (normalized.startsWith('...')) {
    return null;
  }

  // Check for forwardRef pattern: forwardRef(() => ModuleName)
  const forwardRefMatch = normalized.match(/forwardRef\s*\(\s*\(\s*\)\s*=>\s*(\w+)\s*\)/);
  if (forwardRefMatch) {
    return {
      name: forwardRefMatch[1],
      hasForwardRef: true,
      isDynamic: false
    };
  }

  // Check for dynamic module patterns: Module.forRoot(), Module.forRootAsync(), Module.register()
  const dynamicMatch = normalized.match(/^(\w+)\s*\.\s*(forRoot|forRootAsync|register)/);
  if (dynamicMatch) {
    return {
      name: dynamicMatch[1],
      hasForwardRef: false,
      isDynamic: true
    };
  }

  // Check for simple identifier (module name only)
  const simpleMatch = normalized.match(/^(\w+)$/);
  if (simpleMatch) {
    return {
      name: simpleMatch[1],
      hasForwardRef: false,
      isDynamic: false
    };
  }

  return null;
}

/**
 * Extracts module metadata from the @Module decorator.
 *
 * @param decorator - The @Module decorator
 * @returns Object with imports and exports arrays
 */
function extractModuleMetadata(decorator: Decorator): {
  imports: string[];
  exports: string[];
  hasForwardRef: boolean;
  isDynamic: boolean;
} {
  const result = {
    imports: [] as string[],
    exports: [] as string[],
    hasForwardRef: false,
    isDynamic: false
  };

  const args = decorator.getArguments();
  if (args.length === 0) {
    return result;
  }

  const arg = args[0];
  if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    return result;
  }

  const objectLiteral = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const properties = objectLiteral.getProperties();

  for (const prop of properties) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) {
      continue;
    }

    const propAssignment = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
    const propName = propAssignment.getName();

    if (propName !== 'imports' && propName !== 'exports') {
      continue;
    }

    const initializer = propAssignment.getInitializer();
    if (!initializer || initializer.getKind() !== SyntaxKind.ArrayLiteralExpression) {
      continue;
    }

    const arrayLiteral = initializer.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    const elements = arrayLiteral.getElements();

    for (const element of elements) {
      const extracted = extractModuleName(element.getText());
      if (extracted) {
        if (propName === 'imports') {
          result.imports.push(extracted.name);
        } else {
          result.exports.push(extracted.name);
        }

        if (extracted.hasForwardRef) {
          result.hasForwardRef = true;
        }
        if (extracted.isDynamic) {
          result.isDynamic = true;
        }
      }
    }
  }

  return result;
}

/**
 * Parses a single module file to extract module definition.
 *
 * @param project - The ts-morph Project instance
 * @param filePath - Path to the module file
 * @returns Parse result with module node or error
 */
function parseModuleFile(project: Project, filePath: string): IModuleParseResult {
  try {
    const sourceFile = project.addSourceFileAtPath(filePath);
    const classes = sourceFile.getClasses();

    for (const classDecl of classes) {
      const decorators = classDecl.getDecorators();

      for (const decorator of decorators) {
        if (decorator.getName() === 'Module') {
          const moduleName = classDecl.getName();
          if (!moduleName) {
            continue;
          }

          const isGlobal = hasGlobalDecorator(classDecl);
          const metadata = extractModuleMetadata(decorator);

          const module: IModuleNode = {
            name: moduleName,
            filePath: relative(process.cwd(), filePath),
            imports: metadata.imports,
            exports: metadata.exports,
            isGlobal,
            hasForwardRef: metadata.hasForwardRef,
            isDynamic: metadata.isDynamic,
            category: categorizeModule(moduleName, isGlobal)
          };

          return {
            file: filePath,
            success: true,
            module
          };
        }
      }
    }

    return {
      file: filePath,
      success: false,
      error: 'No @Module decorator found'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      file: filePath,
      success: false,
      error: errorMessage
    };
  }
}

// ============================================
// CIRCULAR DEPENDENCY DETECTION
// ============================================

/**
 * Detects circular dependencies between modules.
 *
 * A circular dependency exists when Module A imports Module B
 * and Module B imports Module A (directly or via forwardRef).
 *
 * @param modules - Array of parsed module nodes
 * @returns Array of circular dependency pairs
 */
function detectCircularDependencies(modules: IModuleNode[]): ICircularDependency[] {
  const circularDeps: ICircularDependency[] = [];
  const seen = new Set<string>();

  // Build a map for quick lookup
  const moduleMap = new Map<string, IModuleNode>();
  for (const module of modules) {
    moduleMap.set(module.name, module);
  }

  for (const module of modules) {
    for (const importedName of module.imports) {
      const importedModule = moduleMap.get(importedName);
      if (!importedModule) {
        continue;
      }

      // Check if the imported module also imports this module
      if (importedModule.imports.includes(module.name)) {
        // Create a normalized key to avoid duplicates (A->B same as B->A)
        const key = [module.name, importedName].sort().join('->');
        if (!seen.has(key)) {
          seen.add(key);
          circularDeps.push({
            moduleA: module.name,
            moduleB: importedName
          });
        }
      }
    }
  }

  return circularDeps;
}

// ============================================
// MERMAID DIAGRAM GENERATION
// ============================================

/**
 * Sanitizes a module name for use in Mermaid diagrams.
 *
 * @param name - Module name
 * @returns Sanitized name safe for Mermaid
 */
function sanitizeMermaidId(name: string): string {
  // Replace special characters that might break Mermaid syntax
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Generates a Mermaid flowchart from parsed module data.
 *
 * @param modules - Array of parsed module nodes
 * @param circularDeps - Array of circular dependencies
 * @returns Mermaid flowchart syntax string
 */
function generateMermaidGraph(modules: IModuleNode[], circularDeps: ICircularDependency[]): string {
  const lines: string[] = [];

  // Header
  lines.push('flowchart TD');
  lines.push('');

  // Group modules by category
  const infraModules = modules.filter((m) => m.category === 'infrastructure');
  const featureModules = modules.filter((m) => m.category === 'feature');
  const i18nModules = modules.filter((m) => m.category === 'i18n');

  // Create subgraphs for each category
  if (infraModules.length > 0) {
    lines.push('    subgraph Infrastructure["Infrastructure Modules"]');
    for (const module of infraModules) {
      const id = sanitizeMermaidId(module.name);
      const globalMarker = module.isGlobal ? ' (Global)' : '';
      lines.push(`        ${id}["${module.name}${globalMarker}"]`);
    }
    lines.push('    end');
    lines.push('');
  }

  if (featureModules.length > 0) {
    lines.push('    subgraph Features["Feature Modules"]');
    for (const module of featureModules) {
      const id = sanitizeMermaidId(module.name);
      const dynamicMarker = module.isDynamic ? ' (Dynamic)' : '';
      lines.push(`        ${id}["${module.name}${dynamicMarker}"]`);
    }
    lines.push('    end');
    lines.push('');
  }

  if (i18nModules.length > 0) {
    lines.push('    subgraph I18n["Internationalization"]');
    for (const module of i18nModules) {
      const id = sanitizeMermaidId(module.name);
      lines.push(`        ${id}["${module.name}"]`);
    }
    lines.push('    end');
    lines.push('');
  }

  // Build set of circular dependency pairs for quick lookup
  const circularSet = new Set<string>();
  for (const dep of circularDeps) {
    circularSet.add(`${dep.moduleA}->${dep.moduleB}`);
    circularSet.add(`${dep.moduleB}->${dep.moduleA}`);
  }

  // Create a set of all module names for filtering
  const moduleNames = new Set(modules.map((m) => m.name));

  // Generate dependency arrows
  lines.push('    %% Dependencies');
  const seenEdges = new Set<string>();

  for (const module of modules) {
    const fromId = sanitizeMermaidId(module.name);

    for (const importedName of module.imports) {
      // Skip external modules (not defined in the codebase)
      if (!moduleNames.has(importedName)) {
        continue;
      }

      const toId = sanitizeMermaidId(importedName);
      const edgeKey = `${fromId}->${toId}`;

      // Skip duplicate edges
      if (seenEdges.has(edgeKey)) {
        continue;
      }
      seenEdges.add(edgeKey);

      // Check if this is a circular dependency
      const isCircular = circularSet.has(`${module.name}->${importedName}`);

      if (isCircular) {
        // Use dashed arrow for circular dependencies
        lines.push(`    ${fromId} -.->|forwardRef| ${toId}`);
      } else {
        // Use solid arrow for normal dependencies
        lines.push(`    ${fromId} --> ${toId}`);
      }
    }
  }

  lines.push('');

  // Add styling
  lines.push('    %% Styling');
  lines.push('    classDef global fill:#f9f,stroke:#333,stroke-width:2px');
  lines.push('    classDef dynamic fill:#bbf,stroke:#333,stroke-width:1px');
  lines.push('    classDef feature fill:#bfb,stroke:#333,stroke-width:1px');
  lines.push('    classDef i18n fill:#ffb,stroke:#333,stroke-width:1px');
  lines.push('');

  // Apply classes
  const globalModuleIds = infraModules
    .filter((m) => m.isGlobal)
    .map((m) => sanitizeMermaidId(m.name));
  // Exclude infrastructure/global modules from the dynamic class so global styling takes precedence
  const dynamicModuleIds = modules
    .filter((m) => m.isDynamic && m.category !== 'infrastructure')
    .map((m) => sanitizeMermaidId(m.name));
  const featureModuleIds = featureModules.map((m) => sanitizeMermaidId(m.name));
  const i18nModuleIds = i18nModules.map((m) => sanitizeMermaidId(m.name));

  if (globalModuleIds.length > 0) {
    lines.push(`    class ${globalModuleIds.join(',')} global`);
  }
  if (dynamicModuleIds.length > 0) {
    lines.push(`    class ${dynamicModuleIds.join(',')} dynamic`);
  }
  if (featureModuleIds.length > 0) {
    lines.push(`    class ${featureModuleIds.join(',')} feature`);
  }
  if (i18nModuleIds.length > 0) {
    lines.push(`    class ${i18nModuleIds.join(',')} i18n`);
  }

  return lines.join('\n');
}

/**
 * Generates markdown documentation with the Mermaid diagram.
 *
 * @param mermaid - The Mermaid diagram syntax
 * @param modules - Array of parsed module nodes
 * @returns Markdown-formatted documentation
 */
function generateMarkdown(mermaid: string, modules: IModuleNode[]): string {
  const lines: string[] = [];

  lines.push('# Module Dependency Graph');
  lines.push('');
  lines.push('<!-- AUTO-GENERATED FILE - DO NOT EDIT MANUALLY -->');
  lines.push('<!-- Generated by: pnpm run docs:modules -->');
  lines.push('');
  lines.push('This diagram shows the NestJS module dependencies for the API application.');
  lines.push('');
  lines.push('## Diagram');
  lines.push('');
  lines.push('![Module Dependency Graph](../diagrams/png/module-deps.png)');
  lines.push('');
  lines.push('## Legend');
  lines.push('');
  lines.push('- **Pink nodes**: Global modules (available throughout the application)');
  lines.push('- **Blue nodes**: Dynamic modules (configured via `.forRoot()` or similar)');
  lines.push('- **Green nodes**: Feature modules');
  lines.push('- **Yellow nodes**: Internationalization modules');
  lines.push('- **Solid arrows**: Normal imports');
  lines.push('- **Dashed arrows**: Circular dependencies (resolved via `forwardRef`)');
  lines.push('');
  lines.push('## Mermaid Source');
  lines.push('');
  lines.push('```mermaid');
  lines.push(mermaid);
  lines.push('```');
  lines.push('');

  // Module summary table
  lines.push('## Module Summary');
  lines.push('');
  lines.push('| Module | Category | Global | Dynamic | Imports |');
  lines.push('| ------ | -------- | ------ | ------- | ------- |');

  const sortedModules = [...modules].sort((a, b) => a.name.localeCompare(b.name));
  for (const module of sortedModules) {
    const globalIcon = module.isGlobal ? 'Yes' : 'No';
    const dynamicIcon = module.isDynamic ? 'Yes' : 'No';
    const imports = module.imports.length > 0 ? module.imports.join(', ') : '-';
    lines.push(
      `| ${module.name} | ${module.category} | ${globalIcon} | ${dynamicIcon} | ${imports} |`
    );
  }

  lines.push('');

  return lines.join('\n');
}

// ============================================
// FILE OUTPUT
// ============================================

/**
 * Writes content to a file, creating directories as needed.
 *
 * @param filePath - The output file path
 * @param content - The content to write
 */
function writeOutputFile(filePath: string, content: string): void {
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, content, 'utf-8');
}

// ============================================
// MAIN EXECUTION
// ============================================

/**
 * Main execution function.
 *
 * Discovers module files, parses them using ts-morph, extracts module
 * definitions, generates Mermaid diagram, and writes output files.
 */
function main(): void {
  console.log('Generating Module Dependency Graph from NestJS modules...\n');

  // Discover module files
  const files = discoverModuleFiles();

  if (files.length === 0) {
    console.error('ERROR: No module files found in:', MODULE_ROOT);
    process.exit(1);
  }

  console.log(`Found ${files.length} module file(s):\n`);

  // Initialize ts-morph project
  const project = createProject();

  // Parse each file
  const results: IModuleParseResult[] = [];
  const modules: IModuleNode[] = [];

  for (const file of files) {
    console.log(`  Parsing: ${file}`);
    const result = parseModuleFile(project, file);
    results.push(result);

    if (result.success && result.module) {
      console.log(`    + ${result.module.name} (${result.module.category})`);
      modules.push(result.module);
    } else {
      console.log(`    - Skipped: ${result.error}`);
    }
  }

  // Summary
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  console.log('\n--- Parsing Summary ---');
  console.log(`  Files scanned:  ${results.length}`);
  console.log(`  Modules found:  ${successes.length}`);
  console.log(`  Skipped:        ${failures.length}`);

  if (modules.length === 0) {
    console.error('\nERROR: No modules found to generate diagram');
    process.exit(1);
  }

  // Detect circular dependencies
  const circularDeps = detectCircularDependencies(modules);
  console.log(`  Circular deps:  ${circularDeps.length}`);

  if (circularDeps.length > 0) {
    console.log('\n--- Circular Dependencies ---');
    for (const dep of circularDeps) {
      console.log(`  ${dep.moduleA} <-> ${dep.moduleB}`);
    }
  }

  // Generate Mermaid diagram
  console.log('\n--- Generating Diagram ---\n');

  const mermaidContent = generateMermaidGraph(modules, circularDeps);
  const markdownContent = generateMarkdown(mermaidContent, modules);

  // Count by category
  const infraCount = modules.filter((m) => m.category === 'infrastructure').length;
  const featureCount = modules.filter((m) => m.category === 'feature').length;
  const i18nCount = modules.filter((m) => m.category === 'i18n').length;

  console.log(`  Infrastructure: ${infraCount}`);
  console.log(`  Feature:        ${featureCount}`);
  console.log(`  I18n:           ${i18nCount}`);

  // Write output files
  console.log('\n--- Writing Output Files ---\n');

  try {
    writeOutputFile(MERMAID_OUTPUT_PATH, mermaidContent);
    console.log(`  + ${MERMAID_OUTPUT_PATH}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  - Failed to write ${MERMAID_OUTPUT_PATH}: ${errorMessage}`);
    process.exit(1);
  }

  try {
    writeOutputFile(MARKDOWN_OUTPUT_PATH, markdownContent);
    console.log(`  + ${MARKDOWN_OUTPUT_PATH}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  - Failed to write ${MARKDOWN_OUTPUT_PATH}: ${errorMessage}`);
    process.exit(1);
  }

  console.log('\nModule dependency graph generated successfully.');
}

main();

// Export types and functions for use by other modules
export type { IModuleNode, ICircularDependency, IModuleParseResult, ModuleCategory };
export {
  parseModuleFile,
  discoverModuleFiles,
  createProject,
  detectCircularDependencies,
  generateMermaidGraph,
  generateMarkdown,
  categorizeModule
};
