/**
 * Generate Markdown documentation from OpenAPI/Swagger specifications.
 *
 * This script parses OpenAPI 3.x specs, dereferences $ref pointers, groups
 * endpoints by tags, and generates comprehensive markdown documentation for
 * each endpoint including request/response schemas, authentication, and examples.
 *
 * @example
 * ```bash
 * npx tsx scripts/docs/generate-openapi-docs.ts
 * ```
 *
 * @module scripts/docs/generate-openapi-docs
 */

import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve as pathResolve, sep as pathSep } from 'node:path';

import * as SwaggerParser from '@apidevtools/swagger-parser';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Path to the OpenAPI specification file */
const OPENAPI_SPEC_PATH = '.agents/docs/reference/api/openapi-v1.json';

/** Output directory for generated markdown documentation */
const OUTPUT_DIR = '.agents/docs/reference/api';

/** Auto-generated file header comment */
const AUTO_GENERATED_HEADER = `<!-- AUTO-GENERATED: Do not edit manually. Run pnpm docs:openapi to regenerate. -->`;

/** Supported OpenAPI version prefix */
const SUPPORTED_OPENAPI_VERSION = '3.';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * OpenAPI 3.x specification structure (after dereferencing).
 *
 * Represents the root OpenAPI document with all $ref pointers resolved.
 */
interface IOpenAPISpec {
  /** OpenAPI version (e.g., "3.0.0", "3.1.0") */
  openapi: string;
  /** API metadata */
  info: IOpenAPIInfo;
  /** Available paths and their operations */
  paths: Record<string, IPathItem>;
  /** Reusable schemas, parameters, responses, etc. */
  components?: IComponents;
  /** List of tags for organizing endpoints */
  tags?: ITag[];
}

/**
 * API metadata information.
 */
interface IOpenAPIInfo {
  /** API title */
  title: string;
  /** API version */
  version: string;
  /** API description */
  description?: string;
}

/**
 * Reusable components (schemas, parameters, etc.).
 */
interface IComponents {
  /** Reusable schemas */
  schemas?: Record<string, ISchema>;
  /** Reusable parameters */
  parameters?: Record<string, IParameter>;
  /** Security scheme definitions */
  securitySchemes?: Record<string, ISecurityScheme>;
}

/**
 * Tag metadata for grouping endpoints.
 */
interface ITag {
  /** Tag name */
  name: string;
  /** Tag description */
  description?: string;
}

/**
 * Path item with HTTP methods and operations.
 */
interface IPathItem {
  /** GET operation */
  get?: IOperation;
  /** POST operation */
  post?: IOperation;
  /** PUT operation */
  put?: IOperation;
  /** PATCH operation */
  patch?: IOperation;
  /** DELETE operation */
  delete?: IOperation;
  /** Parameters applicable to all operations in this path */
  parameters?: IParameter[];
}

/**
 * HTTP operation (endpoint) definition.
 */
interface IOperation {
  /** Unique operation identifier */
  operationId?: string;
  /** Short summary of the operation */
  summary?: string;
  /** Detailed description */
  description?: string;
  /** Tags for grouping */
  tags?: string[];
  /** Operation parameters */
  parameters?: IParameter[];
  /** Request body schema */
  requestBody?: IRequestBody;
  /** Response definitions by status code */
  responses: Record<string, IResponse>;
  /** Security requirements */
  security?: ISecurityRequirement[];
}

/**
 * Parameter definition (path, query, header, cookie).
 */
interface IParameter {
  /** Parameter name */
  name: string;
  /** Parameter location */
  in: 'path' | 'query' | 'header' | 'cookie';
  /** Parameter description */
  description?: string;
  /** Whether the parameter is required */
  required?: boolean;
  /** Parameter schema */
  schema: ISchema;
}

/**
 * Request body definition.
 */
interface IRequestBody {
  /** Request body description */
  description?: string;
  /** Whether request body is required */
  required?: boolean;
  /** Content by media type */
  content: Record<string, IMediaType>;
}

/**
 * Response definition.
 */
interface IResponse {
  /** Response description */
  description: string;
  /** Response content by media type */
  content?: Record<string, IMediaType>;
}

/**
 * Media type definition (e.g., application/json).
 */
interface IMediaType {
  /** Media type schema */
  schema: ISchema;
  /** Example value */
  example?: unknown;
}

/**
 * JSON Schema definition.
 */
interface ISchema {
  /** Schema type (string, number, object, array, etc.) */
  type?: string;
  /** Format hint (e.g., date-time, uuid, email) */
  format?: string;
  /** Object properties */
  properties?: Record<string, ISchema>;
  /** Array item schema */
  items?: ISchema;
  /** Required property names */
  required?: string[];
  /** Enum values */
  enum?: unknown[];
  /** Schema description */
  description?: string;
  /** Example value */
  example?: unknown;
  /** AllOf composition */
  allOf?: ISchema[];
  /** AnyOf composition */
  anyOf?: ISchema[];
  /** OneOf composition */
  oneOf?: ISchema[];
  /** Ref pointer (should be resolved after dereferencing) */
  $ref?: string;
}

/**
 * Security scheme definition.
 */
interface ISecurityScheme {
  /** Security scheme type */
  type: string;
  /** Security scheme description */
  description?: string;
  /** HTTP scheme name (for type: http) */
  scheme?: string;
  /** Bearer format (for type: http, scheme: bearer) */
  bearerFormat?: string;
}

/**
 * Security requirement (applied to operations).
 */
type ISecurityRequirement = Record<string, string[]>;

/**
 * Grouped endpoints by tag.
 */
interface IEndpointGroup {
  /** Tag name */
  tag: string;
  /** Tag description */
  description?: string;
  /** Endpoints in this group */
  endpoints: IEndpointDoc[];
}

/**
 * Parsed endpoint documentation.
 */
interface IEndpointDoc {
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Endpoint path */
  path: string;
  /** Operation identifier */
  operationId: string;
  /** Short summary */
  summary: string;
  /** Detailed description */
  description: string;
  /** Parameters */
  parameters: IParameter[];
  /** Request body */
  requestBody?: IRequestBody;
  /** Responses */
  responses: Record<string, IResponse>;
  /** Security requirements */
  security: ISecurityRequirement[];
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parses and dereferences an OpenAPI specification file.
 *
 * Reads an OpenAPI 3.x spec from a file (JSON or YAML), validates the version,
 * and dereferences all $ref pointers to produce a fully resolved specification.
 *
 * @param filePath - Path to the OpenAPI spec file (JSON or YAML)
 * @returns Fully dereferenced OpenAPI specification
 * @throws {Error} If file not found, spec is invalid, or version is unsupported
 *
 * @example
 * ```typescript
 * const spec = await parseOpenAPISpec('.agents/docs/reference/api/openapi-v1.json');
 * console.log(spec.info.title); // API title
 * ```
 */
async function parseOpenAPISpec(filePath: string): Promise<IOpenAPISpec> {
  try {
    // SECURITY: Restrict $ref resolution to local files only
    // Prevents SSRF attacks via remote $ref pointers
    const spec = (await SwaggerParser.dereference(filePath, {
      resolve: {
        // Allow external file refs (for multi-file OpenAPI specs)
        // but restrict to local filesystem via canRead callback
        external: true,
        // CRITICAL: Block HTTP/HTTPS refs (SSRF protection)
        http: false,
        // Allow local file references within the project only
        file: {
          canRead: (file: { url: string }) => {
            // Only allow files within the project directory
            const projectRoot = process.cwd();
            const resolvedPath = pathResolve(file.url);
            return resolvedPath.startsWith(projectRoot + pathSep);
          }
        }
      }
    })) as IOpenAPISpec;

    // Validate OpenAPI version is 3.x
    if (!spec.openapi || !spec.openapi.startsWith(SUPPORTED_OPENAPI_VERSION)) {
      throw new Error(
        `Unsupported OpenAPI version: ${spec.openapi}. Only OpenAPI 3.x is supported.`
      );
    }

    // Validate required fields per OpenAPI 3.x specification
    if (!spec.info) {
      throw new Error('OpenAPI spec missing required field: info');
    }
    if (!spec.info.title) {
      throw new Error('OpenAPI spec missing required field: info.title');
    }
    if (!spec.info.version) {
      throw new Error('OpenAPI spec missing required field: info.version');
    }
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      throw new Error(
        'OpenAPI spec missing required field: paths (must have at least one endpoint)'
      );
    }

    return spec;
  } catch (error) {
    const err = error as Error;
    // SECURITY: Sanitize file paths from error messages to prevent information disclosure
    const sanitizedMessage = err.message.replace(/\/[^\s:]+/g, '[path]');
    throw new Error(`Failed to parse OpenAPI spec: ${sanitizedMessage}`);
  }
}

/**
 * Default tag for endpoints without explicit tags.
 */
const DEFAULT_TAG = 'general';

/**
 * HTTP methods supported by OpenAPI 3.x Path Item Object.
 * Includes all 8 valid operation methods per OpenAPI specification.
 */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

/**
 * Groups API endpoints by their OpenAPI tags.
 *
 * Iterates through all paths and operations in the OpenAPI spec,
 * extracting endpoints and grouping them by their assigned tags.
 * Endpoints without tags are assigned to the 'general' group.
 * Endpoints with multiple tags are duplicated to each group.
 *
 * @param spec - Dereferenced OpenAPI specification
 * @returns Map of tag names to endpoint documents
 *
 * @example
 * ```typescript
 * const spec = await parseOpenAPISpec('openapi.json');
 * const groups = groupEndpointsByTags(spec);
 * console.log(groups.get('users')); // All user-related endpoints
 * ```
 */
function groupEndpointsByTags(spec: IOpenAPISpec): Map<string, IEndpointDoc[]> {
  const groups = new Map<string, IEndpointDoc[]>();

  // Iterate through all paths in the spec
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    // Validate path format before processing
    if (!isValidOpenAPIPath(path)) {
      continue;
    }

    // Iterate through all HTTP methods in the path
    for (const [method, operation] of Object.entries(pathItem)) {
      // Skip non-operation properties (like 'parameters', 'summary', etc.)
      if (!isOperation(method)) continue;

      // Type narrow: operation is IOperation after isOperation check
      const operationData = operation as IOperation;

      // Create endpoint document from operation data
      const endpoint = createEndpointDoc(method, path, operationData);

      // Get tags, default to 'general' if none specified
      const tags =
        operationData.tags && operationData.tags.length > 0 ? operationData.tags : [DEFAULT_TAG];

      // Add endpoint to each tag group (supports multiple tags per endpoint)
      for (const tag of tags) {
        if (!groups.has(tag)) {
          groups.set(tag, []);
        }
        groups.get(tag)!.push(endpoint);
      }
    }
  }

  return groups;
}

/**
 * Checks if a method name is a valid HTTP operation.
 *
 * @param method - Method name to check (e.g., 'get', 'post', 'parameters')
 * @returns True if the method is a valid HTTP operation
 *
 * @example
 * ```typescript
 * isOperation('get'); // true
 * isOperation('parameters'); // false (path-level property, not an operation)
 * ```
 */
function isOperation(method: string): boolean {
  return HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number]);
}

/**
 * Validates that a string is a valid OpenAPI path.
 *
 * A valid OpenAPI path MUST:
 * - Start with a forward slash (/)
 * - Not contain consecutive slashes (//)
 * - Not contain path traversal sequences (..)
 * - Not be empty or whitespace-only
 *
 * Valid examples:
 * - /users
 * - /users/{id}
 * - /v1/organizations/{orgId}/users/{userId}
 *
 * Invalid examples:
 * - users (no leading slash)
 * - /users// (consecutive slashes)
 * - /users/../admin (path traversal)
 *
 * @param path - The path string to validate
 * @returns true if the path is a valid OpenAPI path, false otherwise
 *
 * @example
 * ```typescript
 * isValidOpenAPIPath('/users'); // true
 * isValidOpenAPIPath('/users/{id}'); // true
 * isValidOpenAPIPath('users'); // false (no leading slash)
 * isValidOpenAPIPath('/users//list'); // false (consecutive slashes)
 * isValidOpenAPIPath('/users/../admin'); // false (path traversal)
 * isValidOpenAPIPath(''); // false (empty)
 * ```
 */
function isValidOpenAPIPath(path: string): boolean {
  // Validate input is a string and not empty/whitespace
  if (typeof path !== 'string' || path.trim().length === 0) {
    return false;
  }

  // Must start with /
  if (!path.startsWith('/')) {
    return false;
  }

  // No consecutive slashes (//)
  if (path.includes('//')) {
    return false;
  }

  // No path traversal sequences (..)
  if (path.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Creates an endpoint document from OpenAPI operation data.
 *
 * Extracts and normalizes operation data into a structured endpoint document
 * suitable for markdown generation.
 *
 * @param method - HTTP method (get, post, put, patch, delete, head, options, trace)
 * @param path - Endpoint path (e.g., '/users/{id}')
 * @param operation - OpenAPI operation object
 * @returns Structured endpoint document
 *
 * @example
 * ```typescript
 * const endpoint = createEndpointDoc('get', '/users/{id}', operation);
 * console.log(endpoint.method); // 'GET'
 * console.log(endpoint.operationId); // 'getUserById'
 * ```
 */
function createEndpointDoc(method: string, path: string, operation: IOperation): IEndpointDoc {
  return {
    method: method.toUpperCase(),
    path,
    operationId: operation.operationId || `${method}_${path}`,
    summary: operation.summary || '',
    description: operation.description || '',
    parameters: operation.parameters || [],
    requestBody: operation.requestBody,
    responses: operation.responses,
    security: operation.security || []
  };
}

// [Additional utility functions to be implemented in later tasks: LSK-74-005 through LSK-74-009]

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main entry point for OpenAPI documentation generation.
 *
 * Reads the OpenAPI spec, parses it, dereferences $ref pointers,
 * groups endpoints by tags, and generates markdown documentation.
 *
 * @returns Promise that resolves when generation is complete
 * @throws Error if spec file doesn't exist or parsing fails
 */
async function main(): Promise<void> {
  console.log('OpenAPI to Markdown Generator');
  console.log('==============================\n');

  // Verify spec file exists
  if (!existsSync(OPENAPI_SPEC_PATH)) {
    throw new Error(`OpenAPI spec not found at ${OPENAPI_SPEC_PATH}`);
  }

  console.log(`Reading spec from: ${OPENAPI_SPEC_PATH}`);

  // Parse and dereference OpenAPI spec
  const spec = await parseOpenAPISpec(OPENAPI_SPEC_PATH);

  console.log(`API: ${spec.info.title} v${spec.info.version}`);
  console.log(`Paths: ${Object.keys(spec.paths).length}`);

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`\nOutput directory: ${OUTPUT_DIR}`);

  // Implementation will be completed in later tasks:
  // - LSK-74-003: Parse and dereference spec
  // - LSK-74-004: Group endpoints by tags
  // - LSK-74-005: Generate parameter tables
  // - LSK-74-006: Generate request/response markdown
  // - LSK-74-007: Generate code examples
  // - LSK-74-008: Generate schema documentation
  // - LSK-74-009: Generate INDEX.md table of contents

  console.log('\nDocumentation generation complete!');
}

// ============================================================================
// EXPORTS (for unit testing)
// ============================================================================

export {
  parseOpenAPISpec,
  groupEndpointsByTags,
  isOperation,
  isValidOpenAPIPath,
  createEndpointDoc
};

export type {
  IOpenAPISpec,
  IOpenAPIInfo,
  IComponents,
  ITag,
  IPathItem,
  IOperation,
  IParameter,
  IRequestBody,
  IResponse,
  IMediaType,
  ISchema,
  ISecurityScheme,
  ISecurityRequirement,
  IEndpointGroup,
  IEndpointDoc
};

// ============================================================================
// MODULE GUARD
// ============================================================================

if (require.main === module) {
  main().catch((error) => {
    console.error('Error generating OpenAPI documentation:', error);
    process.exit(1);
  });
}
