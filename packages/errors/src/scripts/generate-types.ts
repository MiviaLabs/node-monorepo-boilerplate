#!/usr/bin/env tsx
/**
 * Type Generation Script
 *
 * Generates the ErrorCode union type from the ERROR_REGISTRY.
 * This ensures ErrorCode is a union of literal types instead of just `string`,
 * providing compile-time type safety and IDE autocomplete.
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ERROR_REGISTRY } from '../registry/definitions/index';

/**
 * Marker comments for the auto-generated section
 */
const START_MARKER = '// [AUTO-GENERATED:ErrorCode] DO NOT EDIT BETWEEN MARKERS';
const END_MARKER = '// [/AUTO-GENERATED:ErrorCode]';

/**
 * Generates the ErrorCode union type from registry keys
 */
function generateErrorCodeType(): string {
  const codes = Object.keys(ERROR_REGISTRY).sort();

  const unionMembers = codes.map((code) => `  | '${code}'`).join('\n');

  return `${START_MARKER}
/**
 * Union type of all registered error codes.
 * Auto-generated from ERROR_REGISTRY by generate-types.ts.
 *
 * Provides compile-time type safety and IDE autocomplete for error codes.
 * The \`(string & {})\` fallback allows dynamic error codes while
 * still providing autocomplete for known codes.
 */
export type ErrorCode =
${unionMembers}
  | (string & {}); // Allow arbitrary strings for extensibility
${END_MARKER}`;
}

/**
 * Main execution
 */
function main() {
  // eslint-disable-next-line no-console
  console.log('🔨 Generating ErrorCode union type...');

  const typesFile = join(__dirname, '..', 'registry', 'error-registry.types.ts');
  const content = readFileSync(typesFile, 'utf-8');

  const generatedType = generateErrorCodeType();

  let newContent: string;

  // Check if markers already exist
  if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
    // Replace content between markers
    const startIdx = content.indexOf(START_MARKER);
    const endIdx = content.indexOf(END_MARKER) + END_MARKER.length;
    newContent = content.substring(0, startIdx) + generatedType + content.substring(endIdx);
  } else {
    // Replace the old ErrorCode type definition
    newContent = content.replace(
      /\/\*\*\n \* Union type of all registered error codes\n \* This is auto-generated from the ERROR_REGISTRY\n \*\/\nexport type ErrorCode = string;/,
      generatedType
    );
  }

  // Detect silent failure: if generation produced no changes, throw error
  if (newContent === content) {
    throw new Error(
      'ErrorCode type generation produced no changes. ' +
        'Ensure AUTO-GENERATED markers or the expected ErrorCode type block are present and up to date.'
    );
  }

  writeFileSync(typesFile, newContent, 'utf-8');

  const codes = Object.keys(ERROR_REGISTRY);
  // eslint-disable-next-line no-console
  console.log(`✅ Generated ErrorCode union type with ${codes.length} error codes`);
  // eslint-disable-next-line no-console
  console.log(`   Updated: ${typesFile}`);
}

// Run if executed directly (ES module check)
// Resolve to absolute path before converting to file URL to support relative paths
const scriptPath = process.argv[1];
const isMainModule =
  scriptPath && import.meta.url === pathToFileURL(join(process.cwd(), scriptPath)).href;

if (isMainModule) {
  try {
    main();
    process.exit(0);
  } catch (error) {
    console.error('❌ Generation failed:', error);
    process.exit(1);
  }
}

export { main };
