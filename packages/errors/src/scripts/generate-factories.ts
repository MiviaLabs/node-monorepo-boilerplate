#!/usr/bin/env tsx
/**
 * Factory Generation Script
 *
 * Generates type-safe factory methods for creating RegisteredError instances.
 * This script reads the ERROR_REGISTRY and generates a factory file with
 * methods for each error code.
 *
 * Generated factory methods provide:
 * - Type-safe parameters (required vs optional)
 * - Autocomplete support for parameter names
 * - Type inference for parameter values
 * - Better developer experience
 *
 * @packageDocumentation
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ERROR_REGISTRY } from '../registry/definitions/index';

/**
 * Generate TypeScript type string for error parameters
 */
function generateParametersType(
  params: readonly { name: string; required: boolean; type: string }[]
): string {
  if (!params || params.length === 0) {
    return 'Record<string, never>';
  }

  const requiredParams = params.filter((p) => p.required);
  const optionalParams = params.filter((p) => !p.required);

  const parts: string[] = [];

  // Required parameters as a single object type
  if (requiredParams.length > 0) {
    const requiredFields = requiredParams
      .map((p) => {
        const tsType = mapParamTypeToTs(p.type);
        return `    ${p.name}: ${tsType};`;
      })
      .join('\n');
    parts.push(`{\n${requiredFields}\n  }`);
  }

  // Optional parameters with Partial<>
  if (optionalParams.length > 0) {
    const optionalFields = optionalParams
      .map((p) => {
        const tsType = mapParamTypeToTs(p.type);
        return `    ${p.name}?: ${tsType};`;
      })
      .join('\n');
    parts.push(`Partial<{\n${optionalFields}\n  }>`);
  }

  if (parts.length === 0) {
    return 'Record<string, never>';
  }

  if (parts.length === 1) {
    return parts[0];
  }

  // Intersection of required and optional
  return parts.join(' & ');
}

/**
 * Maps registry param types to TypeScript types
 */
function mapParamTypeToTs(paramType: string): string {
  switch (paramType) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'Date | string';
    case 'object':
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

/**
 * Generates a factory method signature and implementation
 */
function generateFactoryMethod(
  code: string,
  definition: {
    message: string;
    parameters?: readonly { name: string; required: boolean; type: string }[];
  }
): string {
  const methodName = codeToMethodName(code);
  const paramsType = generateParametersType(definition.parameters || []);

  // Generate JSDoc - Note: @param tags don't use ? suffix in JSDoc (optional is indicated in description)
  const paramsDocs =
    definition.parameters && definition.parameters.length > 0
      ? definition.parameters
          .map((p) => {
            const description =
              'description' in p ? (p as { description?: string }).description : p.type;
            const optionalMarker = p.required ? '' : ' (optional)';
            return `   * @param parameters.${p.name} - ${description}${optionalMarker}`;
          })
          .join('\n')
      : '   * No parameters required';

  const jsdoc = `  /**
   * Factory for ${code}: ${definition.message.split('{').join('{$').split('}').join('}')}
   *
${paramsDocs}
   *
   * @example
   * \`\`\`ts
   * throw Errors.${methodName}(${generateExampleParams(definition.parameters)});
   * \`\`\`
   */`;

  // Generate method signature
  const signature = `  static ${methodName}(\n    parameters: ${paramsType},\n    metadata?: import('../registry/error-registry.types').ErrorMetadata,\n  ): RegisteredError`;

  // Generate implementation
  const implementation = ` {
    return new RegisteredError('${code}', parameters, metadata);
  }`;

  return `${jsdoc}\n${signature}${implementation}\n`;
}

/**
 * Generates example parameters for JSDoc
 */
function generateExampleParams(
  parameters?: readonly { name: string; required: boolean; type: string }[]
): string {
  if (!parameters || parameters.length === 0) {
    return '{}';
  }

  const examples: string[] = [];

  for (const param of parameters) {
    if (param.required) {
      switch (param.type) {
        case 'string':
          examples.push(`${param.name}: 'example'`);
          break;
        case 'number':
          examples.push(`${param.name}: 123`);
          break;
        case 'boolean':
          examples.push(`${param.name}: true`);
          break;
        case 'date':
          examples.push(`${param.name}: new Date()`);
          break;
        case 'object':
          examples.push(`${param.name}: {}`);
          break;
      }
    }
  }

  return examples.length > 0 ? `{ ${examples.join(', ')} }` : '{}';
}

/**
 * Converts error code to method name
 * e.g., USER_001 -> userNotFound
 */
function codeToMethodName(code: string): string {
  const [prefix, number] = code.split('_');

  // Map prefixes to domain names
  const domainMap: Record<string, string> = {
    USER: 'user',
    AUTH: 'auth',
    VAL: 'validation',
    DB: 'database',
    BIZ: 'business',
    EXT: 'external',
    FILE: 'file',
    SYS: 'system'
  };

  const domain = domainMap[prefix] || prefix.toLowerCase();

  // Look up the error definition to generate a descriptive name
  const definition = ERROR_REGISTRY[code];
  if (!definition) {
    return `${domain}${number}`;
  }

  // Generate method name from error message
  // Remove special characters, keep only alphanumeric
  const words = definition.message
    .toLowerCase()
    .replace(/[{}]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ') // Replace special chars with space
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 3); // Use first 3 words max (to reduce collisions)

  const camelCase = words
    .map((word, index) => {
      if (index === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');

  // Ensure method name is a valid JavaScript identifier
  // Always append the error number to prevent duplicates
  const methodName = `${domain}${camelCase}${number}`;

  // Fallback if we somehow generated an invalid identifier
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(methodName)) {
    return `${domain}${number}`;
  }

  return methodName;
}

/**
 * Generates the complete Errors factory class
 */
function generateFactoryClass(): string {
  const lines: string[] = [];

  // File header
  lines.push('/**');
  lines.push(' * Errors Factory Class');
  lines.push(' *');
  lines.push(' * AUTO-GENERATED by generate-factories.ts');
  lines.push(' * DO NOT EDIT MANUALLY');
  lines.push(' *');
  lines.push(' * This file provides type-safe factory methods for creating');
  lines.push(' * RegisteredError instances with autocomplete support.');
  lines.push(' *');
  lines.push(' * @example');
  lines.push(' * ```ts');
  lines.push(" * import { Errors } from '@package/errors';");
  lines.push(" * throw Errors.userNotFound({ userId: '123' });");
  lines.push(' * ```');
  lines.push(' */');
  lines.push('');
  lines.push("import { RegisteredError } from './registered-error.exception';");
  lines.push('');
  lines.push('/**');
  lines.push(' * Type-safe factory class for creating RegisteredError instances');
  lines.push(' *');
  lines.push(' * This class provides a factory method for each error code in the');
  lines.push(' * registry with full type safety for parameters.');
  lines.push(' *');
  lines.push(' * @example');
  lines.push(' * ```ts');
  lines.push(" * throw Errors.userNotFound({ userId: '123' });");
  lines.push(' * throw Errors.authInvalidCredentials();');
  lines.push(" * throw Errors.validationFailed({ field: 'email' }, { requestId: 'abc' });");
  lines.push(' * ```');
  lines.push(' */');
  lines.push('export class Errors {');
  lines.push('  // Prevent instantiation');
  lines.push('  private constructor() {}');
  lines.push('');

  // Generate factory methods for each error code
  const sortedCodes = Object.keys(ERROR_REGISTRY).sort();

  for (const code of sortedCodes) {
    const definition = ERROR_REGISTRY[code];
    lines.push(generateFactoryMethod(code, definition));
    lines.push('');
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Main execution
 */
function main() {
  // eslint-disable-next-line no-console
  console.log('🔨 Generating Errors factory class...');

  // Generate the factory class
  const factoryContent = generateFactoryClass();

  // Ensure output directory exists
  const outputDir = join(__dirname, '..', 'exceptions');
  const outputFile = join(outputDir, 'errors.factory.ts');

  // Write the file
  writeFileSync(outputFile, factoryContent + '\n', 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`✅ Generated: ${outputFile}`);
  // eslint-disable-next-line no-console
  console.log(`   Generated ${Object.keys(ERROR_REGISTRY).length} factory methods`);
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Usage:');
  // eslint-disable-next-line no-console
  console.log("  import { Errors } from '@package/errors';");
  // eslint-disable-next-line no-console
  console.log("  throw Errors.userNotFound({ userId: '123' });");
}

// Run if executed directly (ES module check)
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;

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
