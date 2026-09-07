/**
 * Generate ER diagram data from Drizzle schema files.
 *
 * This script uses ts-morph to parse TypeScript files and extract complete
 * table definitions with columns, constraints, and foreign key relationships
 * from Drizzle ORM schema files.
 *
 * @example
 * ```bash
 * npx tsx scripts/docs/generate-er-diagram.ts
 * ```
 *
 * @module scripts/docs/generate-er-diagram
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  ModuleKind,
  ModuleResolutionKind,
  Project,
  ScriptTarget,
  SyntaxKind,
  type CallExpression,
  type SourceFile
} from 'ts-morph';

// ============================================
// TYPES AND INTERFACES
// ============================================

/**
 * Column definition extracted from Drizzle schema.
 *
 * Represents a single column within a table with all its properties
 * and constraints.
 */
interface IColumnDefinition {
  /** Column name as defined in the schema */
  name: string;
  /** Mermaid-friendly type name (e.g., 'int', 'string', 'uuid') */
  type: string;
  /** Whether this column is a primary key */
  isPK: boolean;
  /** Whether this column is a foreign key */
  isFK: boolean;
  /** Whether this column has a unique constraint */
  isUnique: boolean;
  /** Whether this column allows null values */
  isNullable: boolean;
  /** Whether this column has a default value */
  hasDefault: boolean;
}

/**
 * Foreign key relationship extracted from Drizzle schema.
 *
 * Represents a reference from one table column to another table's column.
 */
interface IForeignKeyDefinition {
  /** Column name in the source table */
  column: string;
  /** Name of the referenced table */
  referencedTable: string;
  /** Column name in the referenced table */
  referencedColumn: string;
  /** ON DELETE behavior (e.g., 'cascade', 'set null') */
  onDelete?: string;
}

/**
 * Complete table definition extracted from a Drizzle pgTable call.
 *
 * Contains all information needed to render the table in an ER diagram.
 */
interface ITableDefinition {
  /** Table name as defined in pgTable */
  tableName: string;
  /** List of column definitions */
  columns: IColumnDefinition[];
  /** List of foreign key relationships */
  foreignKeys: IForeignKeyDefinition[];
}

/**
 * Result of parsing a single schema file.
 */
interface IParseResult {
  /** Path to the parsed file */
  file: string;
  /** Whether parsing was successful */
  success: boolean;
  /** List of tables extracted from the file */
  tables: ITableDefinition[];
  /** Error message if parsing failed */
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Schema directories to scan for Drizzle table definitions.
 * Supports multiple database packages in the monorepo.
 */
const SCHEMA_DIRS = ['packages/db-core/src/schemas', 'packages/db-outbox/src/schema'];
const SCHEMA_PATTERN = '.schema.ts';

// Output paths for generated files
const MERMAID_OUTPUT_PATH = '.agents/docs/reference/diagrams/mermaid/er-diagram.mmd';
const MARKDOWN_OUTPUT_PATH = '.agents/docs/reference/database/er-diagram.md';

/**
 * Maps Drizzle column types to Mermaid-friendly type names.
 *
 * Drizzle types are mapped to simpler, more readable types for
 * display in ER diagrams.
 */
const DRIZZLE_TYPE_MAP: Record<string, string> = {
  serial: 'int',
  integer: 'int',
  bigint: 'bigint',
  smallint: 'smallint',
  varchar: 'string',
  text: 'text',
  uuid: 'uuid',
  boolean: 'bool',
  timestamp: 'timestamp',
  date: 'date',
  time: 'time',
  jsonb: 'jsonb',
  json: 'json',
  numeric: 'decimal',
  real: 'float',
  doublePrecision: 'double'
};

// ============================================
// TS-MORPH PROJECT SETUP
// ============================================

/**
 * Initializes the ts-morph Project with workspace tsconfig.
 *
 * Uses the workspace tsconfig.base.json for proper type resolution
 * across the monorepo.
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
 * Discovers all schema files across all configured schema directories.
 *
 * Locates all files matching the *.schema.ts pattern in the configured
 * SCHEMA_DIRS (db-core, db-outbox, etc.).
 *
 * @returns Array of relative paths to schema files (relative to repository root)
 */
function discoverSchemaFiles(): string[] {
  const allFiles: string[] = [];

  for (const schemaDir of SCHEMA_DIRS) {
    if (!existsSync(schemaDir)) {
      continue;
    }

    const files = readdirSync(schemaDir)
      .filter((file) => file.endsWith(SCHEMA_PATTERN))
      .map((file) => join(schemaDir, file));

    allFiles.push(...files);
  }

  return allFiles.sort((a, b) => a.localeCompare(b));
}

// ============================================
// COLUMN PARSING
// ============================================

/**
 * Maps a Drizzle type to a Mermaid-friendly type name.
 *
 * @param drizzleType - The Drizzle column type (e.g., 'serial', 'varchar')
 * @returns Mermaid-friendly type name
 */
function mapDrizzleType(drizzleType: string): string {
  return DRIZZLE_TYPE_MAP[drizzleType] ?? drizzleType;
}

/**
 * Extracts the base type from a Drizzle column method chain.
 *
 * Parses method chains like `serial('id').primaryKey()` to extract
 * the base type 'serial'.
 *
 * @param methodChainText - The full text of the column initializer
 * @returns The base Drizzle type name
 */
function extractBaseType(methodChainText: string): string {
  // Match the first function call in the chain
  // Examples: serial('id'), varchar('name', { length: 255 }), uuid('id')
  const match = methodChainText.match(/^(\w+)\s*\(/);
  return match ? match[1] : 'unknown';
}

/**
 * Escapes special regex characters in a string.
 *
 * Prevents ReDoS attacks by ensuring method names with special characters
 * are treated as literal strings in regex patterns.
 *
 * @param str - The string to escape
 * @returns String with regex metacharacters escaped
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a method chain contains a specific method call.
 *
 * @param methodChainText - The full text of the column initializer
 * @param methodName - The method name to search for
 * @returns True if the method is present in the chain
 */
function hasMethod(methodChainText: string, methodName: string): boolean {
  // Match .methodName() or .methodName(...) in the chain
  // Escape methodName to prevent ReDoS if it contains regex metacharacters
  const escapedMethodName = escapeRegExp(methodName);
  const pattern = new RegExp(`\\.${escapedMethodName}\\s*\\(`);
  return pattern.test(methodChainText);
}

/**
 * Parses a single column definition from a property assignment.
 *
 * Extracts column name, type, and constraint information from the
 * column's method chain.
 *
 * @param propertyName - The column property name
 * @param initializerText - The full text of the column initializer
 * @returns IColumnDefinition with parsed information
 */
function parseColumn(propertyName: string, initializerText: string): IColumnDefinition {
  const baseType = extractBaseType(initializerText);
  const mappedType = mapDrizzleType(baseType);

  const isPK = hasMethod(initializerText, 'primaryKey');
  const isUnique = hasMethod(initializerText, 'unique');
  const hasNotNull = hasMethod(initializerText, 'notNull');
  const hasDefault = hasMethod(initializerText, 'default');

  // A column is nullable if:
  // - It doesn't have .notNull() AND
  // - It's not a primary key (PKs are implicitly not null)
  const isNullable = !hasNotNull && !isPK;

  // Check for .references() to mark as FK (will be updated later with full FK info)
  const isFK = hasMethod(initializerText, 'references');

  return {
    name: propertyName,
    type: mappedType,
    isPK,
    isFK,
    isUnique,
    isNullable,
    hasDefault
  };
}

// ============================================
// FOREIGN KEY EXTRACTION
// ============================================

/**
 * Normalizes source text by removing comments and extra whitespace.
 *
 * This helps with regex matching by simplifying the text structure
 * while preserving the essential code.
 *
 * @param text - The source text to normalize
 * @returns Normalized text without comments
 */
function normalizeSourceText(text: string): string {
  // Remove single-line comments
  let normalized = text.replace(/\/\/[^\n]*/g, '');

  // Remove multi-line comments
  normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');

  // Collapse multiple whitespace/newlines into single spaces
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized.trim();
}

/**
 * Extracts foreign key information from a column's method chain.
 *
 * Parses `.references()` calls to extract the referenced table and column,
 * handling both direct imports and circular reference patterns using require().
 *
 * @param columnName - The name of the column with the FK reference
 * @param initializerText - The full text of the column initializer
 * @returns IForeignKeyDefinition if a reference is found, undefined otherwise
 */
function extractForeignKey(
  columnName: string,
  initializerText: string
): IForeignKeyDefinition | undefined {
  // Check if this column has a .references() call
  if (!hasMethod(initializerText, 'references')) {
    return undefined;
  }

  // Normalize the text to handle multiline patterns with comments
  const normalized = normalizeSourceText(initializerText);

  // Extract the referenced table and column
  // Pattern 1: Direct import - .references(() => tableName.columnName, {...})
  // Pattern 2: Circular ref - .references(() => require('./file').tableName.columnName, {...})

  let referencedTable: string | undefined;
  let referencedColumn: string | undefined;
  let onDelete: string | undefined;

  // Try to match require() pattern first (circular references)
  // Example: () => require('./organizations.schema').organizations.id
  const requireMatch = normalized.match(
    /\.references\s*\(\s*\(\s*\)\s*=>\s*require\s*\([^)]+\)\s*\.(\w+)\.(\w+)/
  );

  if (requireMatch) {
    referencedTable = requireMatch[1];
    referencedColumn = requireMatch[2];
  } else {
    // Try direct import pattern
    // Example: () => users.id
    const directMatch = normalized.match(/\.references\s*\(\s*\(\s*\)\s*=>\s*(\w+)\.(\w+)/);

    if (directMatch) {
      referencedTable = directMatch[1];
      referencedColumn = directMatch[2];
    }
  }

  // Extract onDelete behavior from the options object
  // Pattern: { onDelete: 'cascade' } or { onDelete: 'set null' }
  const onDeleteMatch = normalized.match(
    /onDelete\s*:\s*['"](\w+(?:\s+\w+)?)['"]|onDelete\s*:\s*['"]([^'"]+)['"]/i
  );

  if (onDeleteMatch) {
    onDelete = onDeleteMatch[1] ?? onDeleteMatch[2];
  }

  if (referencedTable && referencedColumn) {
    return {
      column: columnName,
      referencedTable,
      referencedColumn,
      onDelete
    };
  }

  return undefined;
}

// ============================================
// PGTABLE EXTRACTION
// ============================================

/**
 * Finds all pgTable call expressions in a source file.
 *
 * Searches through all call expressions to find those where the
 * callee is 'pgTable'.
 *
 * @param sourceFile - The ts-morph SourceFile to search
 * @returns Array of CallExpression nodes representing pgTable calls
 */
function findPgTableCalls(sourceFile: SourceFile): CallExpression[] {
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  return callExpressions.filter((callExpr) => {
    const expression = callExpr.getExpression();
    return expression.getText() === 'pgTable';
  });
}

/**
 * Extracts the table name from a pgTable call's first argument.
 *
 * The first argument is expected to be a string literal with the
 * SQL table name.
 *
 * @param pgTableCall - The pgTable CallExpression
 * @returns The table name without quotes, or undefined if not found
 */
function extractTableName(pgTableCall: CallExpression): string | undefined {
  const args = pgTableCall.getArguments();

  if (args.length === 0) {
    return undefined;
  }

  const firstArg = args[0];

  // The first argument should be a string literal
  if (firstArg.getKind() === SyntaxKind.StringLiteral) {
    // Remove surrounding quotes
    const text = firstArg.getText();
    return text.slice(1, -1);
  }

  return undefined;
}

/**
 * Parses a pgTable call to extract the complete ITableDefinition.
 *
 * Extracts the table name, all columns with their types and constraints,
 * and all foreign key relationships.
 *
 * @param pgTableCall - The pgTable CallExpression to parse
 * @returns ITableDefinition with all extracted information
 */
function parsePgTableCall(pgTableCall: CallExpression): ITableDefinition | undefined {
  const tableName = extractTableName(pgTableCall);

  if (!tableName) {
    return undefined;
  }

  const args = pgTableCall.getArguments();

  if (args.length < 2) {
    return { tableName, columns: [], foreignKeys: [] };
  }

  const columnsArg = args[1];
  const columns: IColumnDefinition[] = [];
  const foreignKeys: IForeignKeyDefinition[] = [];

  // The columns argument should be an object literal
  if (columnsArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const objectLiteral = columnsArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const properties = objectLiteral.getProperties();

    for (const prop of properties) {
      // Skip non-property assignments (spread elements, etc.)
      if (prop.getKind() !== SyntaxKind.PropertyAssignment) {
        continue;
      }

      const propAssignment = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
      const columnName = propAssignment.getName();
      const initializer = propAssignment.getInitializer();

      if (!initializer) {
        continue;
      }

      const initializerText = initializer.getText();

      // Parse the column definition
      const column = parseColumn(columnName, initializerText);
      columns.push(column);

      // Extract foreign key if present
      const fk = extractForeignKey(columnName, initializerText);

      if (fk) {
        foreignKeys.push(fk);
      }
    }
  }

  return {
    tableName,
    columns,
    foreignKeys
  };
}

// ============================================
// FILE PARSING
// ============================================

/**
 * Parses a single schema file to extract all table definitions.
 *
 * @param project - The ts-morph Project instance
 * @param filePath - Path to the schema file
 * @returns IParseResult with success status and extracted tables
 */
function parseSchemaFile(project: Project, filePath: string): IParseResult {
  try {
    const sourceFile = project.addSourceFileAtPath(filePath);
    const pgTableCalls = findPgTableCalls(sourceFile);
    const tables: ITableDefinition[] = [];

    for (const call of pgTableCalls) {
      const tableDef = parsePgTableCall(call);

      if (tableDef) {
        tables.push(tableDef);
      }
    }

    return {
      file: filePath,
      success: true,
      tables
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      file: filePath,
      success: false,
      tables: [],
      error: errorMessage
    };
  }
}

// ============================================
// MERMAID ER DIAGRAM GENERATION
// ============================================

/**
 * Represents a relationship between two tables for Mermaid rendering.
 */
interface IRelationship {
  /** Source table name */
  fromTable: string;
  /** Target table name */
  toTable: string;
  /** Mermaid cardinality notation (e.g., '||--|{') */
  cardinality: string;
  /** Relationship label */
  label: string;
}

/**
 * Determines the Mermaid cardinality notation based on FK constraints.
 *
 * Cardinality mapping:
 * - `.notNull()` + `onDelete: 'cascade'` → `||--|{` (mandatory one-to-many)
 * - nullable or `onDelete: 'set null'` → `||--o{` (optional zero-to-many)
 *
 * @param fk - The foreign key definition
 * @param column - The column definition for the FK
 * @returns Mermaid cardinality notation string
 */
function determineCardinality(fk: IForeignKeyDefinition, column: IColumnDefinition): string {
  const isNullable = column.isNullable;
  const onDelete = fk.onDelete?.toLowerCase();

  // If nullable or onDelete is 'set null', it's an optional relationship
  if (isNullable || onDelete === 'set null') {
    return '||--o{';
  }

  // Otherwise, it's a mandatory relationship
  return '||--|{';
}

/**
 * Generates a relationship label from the foreign key context.
 *
 * Creates meaningful labels like "has", "belongs_to", "owns", etc.
 *
 * @param fk - The foreign key definition
 * @param fromTable - The source table name
 * @returns A descriptive relationship label
 */
function generateRelationshipLabel(fk: IForeignKeyDefinition, fromTable: string): string {
  // Common patterns for relationship labels
  const columnName = fk.column.toLowerCase();

  if (columnName.includes('owner')) {
    return 'owns';
  }

  if (columnName.includes('parent')) {
    return 'parent_of';
  }

  if (columnName.includes('assigned') || columnName.includes('created')) {
    return 'assigned_by';
  }

  // Default to "has" for standard foreign key relationships
  return 'has';
}

/**
 * Builds relationships from all tables, handling deduplication.
 *
 * @param tables - Array of table definitions
 * @returns Array of unique relationships
 */
function buildRelationships(tables: ITableDefinition[]): IRelationship[] {
  const relationships: IRelationship[] = [];
  const seen = new Set<string>();

  // Create a map of table names for column lookup
  const tableMap = new Map<string, ITableDefinition>();

  for (const table of tables) {
    tableMap.set(table.tableName, table);
  }

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      // Create a unique key for deduplication
      // Use sorted table names to catch both directions
      const key = [table.tableName, fk.referencedTable].sort().join('->') + ':' + fk.column;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      // Find the column definition for this FK
      const column = table.columns.find((c) => c.name === fk.column);

      if (!column) {
        continue;
      }

      const cardinality = determineCardinality(fk, column);
      const label = generateRelationshipLabel(fk, table.tableName);

      relationships.push({
        fromTable: fk.referencedTable,
        toTable: table.tableName,
        cardinality,
        label
      });
    }
  }

  return relationships;
}

/**
 * Generates the column marker string for Mermaid entity attributes.
 *
 * Combines PK, FK, and UK markers as needed.
 *
 * @param column - The column definition
 * @returns Marker string (e.g., 'PK', 'FK', 'PK,FK', 'UK')
 */
function getColumnMarker(column: IColumnDefinition): string {
  const markers: string[] = [];

  if (column.isPK) {
    markers.push('PK');
  }

  if (column.isFK) {
    markers.push('FK');
  }

  if (column.isUnique && !column.isPK) {
    markers.push('UK');
  }

  return markers.join(',');
}

/**
 * Generates Mermaid erDiagram syntax from parsed table definitions.
 *
 * Creates a complete ER diagram with:
 * - Relationship declarations with proper cardinality
 * - Entity blocks with attribute definitions
 *
 * @param tables - Array of table definitions
 * @returns Complete Mermaid erDiagram syntax string
 */
function generateMermaidER(tables: ITableDefinition[]): string {
  const lines: string[] = [];

  // Header
  lines.push('erDiagram');
  lines.push('');

  // Build and render relationships
  const relationships = buildRelationships(tables);

  if (relationships.length > 0) {
    lines.push('    %% Relationships');

    for (const rel of relationships) {
      lines.push(`    ${rel.fromTable} ${rel.cardinality} ${rel.toTable} : "${rel.label}"`);
    }

    lines.push('');
  }

  // Render entity definitions
  lines.push('    %% Entity Definitions');

  for (const table of tables) {
    lines.push(`    ${table.tableName} {`);

    for (const col of table.columns) {
      const marker = getColumnMarker(col);
      const markerStr = marker ? ` ${marker}` : '';
      lines.push(`        ${col.type} ${col.name}${markerStr}`);
    }

    lines.push('    }');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Wraps Mermaid diagram in markdown code block with header.
 *
 * Adds an auto-generated comment and wraps the diagram in a
 * mermaid code fence for markdown rendering. Also includes
 * a reference to the pre-rendered SVG diagram.
 *
 * @param mermaid - The raw Mermaid diagram syntax
 * @returns Markdown-formatted string with diagram
 */
function generateMarkdown(mermaid: string): string {
  const lines: string[] = [];

  lines.push('# Entity Relationship Diagram');
  lines.push('');
  lines.push('<!-- AUTO-GENERATED FILE - DO NOT EDIT MANUALLY -->');
  lines.push('<!-- Generated by: pnpm run docs:er -->');
  lines.push('');
  lines.push('This diagram shows the database schema relationships for the main database.');
  lines.push('');
  lines.push('## ER Diagram');
  lines.push('');
  lines.push('![Entity Relationship Diagram](../diagrams/png/er-diagram.png)');
  lines.push('');
  lines.push('## Mermaid Source');
  lines.push('');
  lines.push('```mermaid');
  lines.push(mermaid);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

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
 * Discovers schema files, parses them using ts-morph, extracts table
 * definitions, generates Mermaid ER diagram, and writes output files.
 */
function main(): void {
  console.log('Generating ER diagram data from Drizzle schemas...\n');

  // Discover schema files
  const files = discoverSchemaFiles();

  if (files.length === 0) {
    console.error('ERROR: No schema files found in:', SCHEMA_DIRS.join(', '));
    process.exit(1);
  }

  console.log(`Found ${files.length} schema file(s):\n`);

  // Initialize ts-morph project
  const project = createProject();

  // Parse each file
  const results: IParseResult[] = [];
  const allTables: ITableDefinition[] = [];

  for (const file of files) {
    console.log(`  Parsing: ${file}`);
    const result = parseSchemaFile(project, file);
    results.push(result);

    if (result.success) {
      console.log(`    ✓ Found ${result.tables.length} table(s)`);
      allTables.push(...result.tables);
    } else {
      console.log(`    ✗ Failed: ${result.error}`);
    }
  }

  // Summary
  const failures = results.filter((r) => !r.success);
  const successes = results.filter((r) => r.success);

  console.log('\n--- Parsing Summary ---');
  console.log(`  Files parsed:   ${results.length}`);
  console.log(`  Success:        ${successes.length}`);
  console.log(`  Failed:         ${failures.length}`);
  console.log(`  Tables found:   ${allTables.length}`);

  if (failures.length > 0) {
    console.log('\nFailed files:');

    for (const f of failures) {
      console.log(`  - ${f.file}: ${f.error}`);
    }

    process.exit(1);
  }

  if (allTables.length === 0) {
    console.error('\nERROR: No tables found to generate diagram');
    process.exit(1);
  }

  // Generate Mermaid ER diagram
  console.log('\n--- Generating ER Diagram ---\n');

  const mermaidContent = generateMermaidER(allTables);
  const markdownContent = generateMarkdown(mermaidContent);

  // Count relationships for reporting
  const relationships = buildRelationships(allTables);
  console.log(`  Tables:        ${allTables.length}`);
  console.log(`  Relationships: ${relationships.length}`);

  // Write output files
  console.log('\n--- Writing Output Files ---\n');

  try {
    writeOutputFile(MERMAID_OUTPUT_PATH, mermaidContent);
    console.log(`  ✓ ${MERMAID_OUTPUT_PATH}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to write ${MERMAID_OUTPUT_PATH}: ${errorMessage}`);
    process.exit(1);
  }

  try {
    writeOutputFile(MARKDOWN_OUTPUT_PATH, markdownContent);
    console.log(`  ✓ ${MARKDOWN_OUTPUT_PATH}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to write ${MARKDOWN_OUTPUT_PATH}: ${errorMessage}`);
    process.exit(1);
  }

  console.log('\nER diagram generated successfully.');
}

main();

// Export types and functions for use by other modules
export type {
  ITableDefinition,
  IColumnDefinition,
  IForeignKeyDefinition,
  IParseResult,
  IRelationship
};
export {
  parseSchemaFile,
  discoverSchemaFiles,
  createProject,
  mapDrizzleType,
  generateMermaidER,
  generateMarkdown,
  buildRelationships
};
