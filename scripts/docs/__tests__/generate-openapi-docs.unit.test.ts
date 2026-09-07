/**
 * Unit tests for generate-openapi-docs.ts script.
 *
 * Tests OpenAPI spec parsing, dereferencing, and validation with comprehensive
 * coverage of happy paths, error cases, and edge cases.
 *
 * @see scripts/docs/generate-openapi-docs.ts
 */

import { jest } from '@jest/globals';

// Mock @apidevtools/swagger-parser before importing the module under test
const mockDereference = jest.fn();

jest.mock('@apidevtools/swagger-parser', () => ({
  dereference: (path: string, options?: unknown) => mockDereference(path, options)
}));

// Import actual functions and types from the implementation
import {
  parseOpenAPISpec,
  groupEndpointsByTags,
  isOperation,
  isValidOpenAPIPath,
  createEndpointDoc,
  IOpenAPISpec
} from '../generate-openapi-docs';

// =============================================================================
// TEST SUITES
// =============================================================================

describe('generate-openapi-docs', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // parseOpenAPISpec
  // ---------------------------------------------------------------------------
  describe('parseOpenAPISpec', () => {
    // -------------------------------------------------------------------------
    // HAPPY PATH TESTS
    // -------------------------------------------------------------------------

    it('should parse valid OpenAPI 3.0.0 spec and return dereferenced spec', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0',
          description: 'Test API description'
        },
        paths: {
          '/users': {
            get: {
              summary: 'Get users',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('test-spec.json');

      // Assert
      expect(result).toEqual(mockSpec);
      expect(result.openapi).toBe('3.0.0');
      expect(result.info.title).toBe('Test API');
      expect(mockDereference).toHaveBeenCalledWith(
        'test-spec.json',
        expect.objectContaining({
          resolve: expect.objectContaining({
            external: true,
            http: false
          })
        })
      );
      expect(mockDereference).toHaveBeenCalledTimes(1);
    });

    it('should parse valid OpenAPI 3.0.3 spec successfully', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.3',
        info: {
          title: 'API v2',
          version: '2.0.0'
        },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('spec-v3.0.3.json');

      // Assert
      expect(result.openapi).toBe('3.0.3');
      expect(result.info.title).toBe('API v2');
    });

    it('should parse valid OpenAPI 3.1.0 spec successfully', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.1.0',
        info: {
          title: 'Modern API',
          version: '3.0.0'
        },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('spec-v3.1.0.yaml');

      // Assert
      expect(result.openapi).toBe('3.1.0');
      expect(result.info.title).toBe('Modern API');
    });

    it('should return spec with all $ref pointers dereferenced', async () => {
      // Arrange - Spec after dereferencing (no $ref in final output)
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Dereferenced API',
          version: '1.0.0'
        },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' }
                        }
                        // Note: No $ref - fully dereferenced
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('spec.json');

      // Assert
      const schema =
        result.paths['/users']?.get?.responses['200']?.content?.['application/json']?.schema;
      expect(schema).toBeDefined();
      expect(schema?.$ref).toBeUndefined(); // No $ref in dereferenced output
      expect(schema?.properties).toBeDefined();
    });

    it('should parse spec with all optional fields present', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Full API',
          version: '1.0.0',
          description: 'Complete API with all fields'
        },
        paths: {
          '/items': {
            get: {
              operationId: 'getItems',
              summary: 'Get items',
              description: 'Retrieves all items',
              tags: ['Items'],
              parameters: [
                {
                  name: 'limit',
                  in: 'query',
                  description: 'Max items to return',
                  required: false,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '200': {
                  description: 'Success'
                }
              },
              security: [{ bearerAuth: [] }]
            }
          }
        },
        components: {
          schemas: {
            Item: {
              type: 'object',
              properties: {
                id: { type: 'string' }
              }
            }
          },
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        },
        tags: [
          {
            name: 'Items',
            description: 'Item operations'
          }
        ]
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('full-spec.json');

      // Assert
      expect(result.info.description).toBe('Complete API with all fields');
      expect(result.components?.schemas?.Item).toBeDefined();
      expect(result.tags?.[0]?.name).toBe('Items');
      expect(result.paths['/items']?.get?.operationId).toBe('getItems');
    });

    it('should parse minimal valid spec with only required fields', async () => {
      // Arrange - Minimal OpenAPI spec (only required fields)
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Minimal API',
          version: '1.0.0'
        },
        paths: {
          '/health': {
            get: {
              responses: {
                '200': {
                  description: 'OK'
                }
              }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('minimal-spec.json');

      // Assert
      expect(result.openapi).toBe('3.0.0');
      expect(result.info.title).toBe('Minimal API');
      expect(result.info.version).toBe('1.0.0');
      expect(result.paths['/health']).toBeDefined();
      expect(result.components).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });

    it('should pass SSRF protection options to prevent remote ref attacks', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Secure API',
          version: '1.0.0'
        },
        paths: {
          '/secure': {
            get: {
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      await parseOpenAPISpec('secure-spec.json');

      // Assert - Verify SSRF protection options
      expect(mockDereference).toHaveBeenCalledWith(
        'secure-spec.json',
        expect.objectContaining({
          resolve: expect.objectContaining({
            external: true, // Allow local file refs
            http: false, // CRITICAL: Block HTTP/HTTPS refs (SSRF protection)
            file: expect.objectContaining({
              canRead: expect.any(Function) // File access restriction callback
            })
          })
        })
      );

      // Verify canRead callback was provided
      const callArgs = mockDereference.mock.calls[0];
      const options = callArgs[1] as { resolve: { file: { canRead: Function } } };
      expect(typeof options.resolve.file.canRead).toBe('function');
    });

    // -------------------------------------------------------------------------
    // ERROR CASE TESTS
    // -------------------------------------------------------------------------

    it('should throw descriptive error when file not found', async () => {
      // Arrange
      mockDereference.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      // Act & Assert
      await expect(parseOpenAPISpec('nonexistent.json')).rejects.toThrow(
        'Failed to parse OpenAPI spec: ENOENT: no such file or directory'
      );
    });

    it('should throw error when spec has invalid JSON/YAML syntax', async () => {
      // Arrange
      mockDereference.mockRejectedValue(new Error('Unexpected token { in JSON at position 15'));

      // Act & Assert
      await expect(parseOpenAPISpec('invalid-syntax.json')).rejects.toThrow(
        'Failed to parse OpenAPI spec: Unexpected token { in JSON at position 15'
      );
    });

    it('should throw validation error when openapi field is missing', async () => {
      // Arrange - Spec without openapi field
      const invalidSpec = {
        info: {
          title: 'Missing Version',
          version: '1.0.0'
        },
        paths: {}
      };

      mockDereference.mockResolvedValue(invalidSpec as unknown);

      // Act & Assert
      await expect(parseOpenAPISpec('no-version.json')).rejects.toThrow(
        'Unsupported OpenAPI version: undefined. Only OpenAPI 3.x is supported.'
      );
    });

    it('should throw error when OpenAPI version is 2.0 (unsupported)', async () => {
      // Arrange - Swagger 2.0 spec (unsupported)
      const swagger2Spec = {
        swagger: '2.0', // Old format
        openapi: '2.0.0', // Even if this exists, it's wrong
        info: {
          title: 'Old API',
          version: '1.0.0'
        },
        paths: {}
      };

      mockDereference.mockResolvedValue(swagger2Spec as unknown);

      // Act & Assert
      await expect(parseOpenAPISpec('swagger2.json')).rejects.toThrow(
        'Unsupported OpenAPI version: 2.0.0. Only OpenAPI 3.x is supported.'
      );
    });

    it('should throw error when OpenAPI version is 4.0 (future unsupported)', async () => {
      // Arrange - Future version not supported
      const futureSpec = {
        openapi: '4.0.0',
        info: {
          title: 'Future API',
          version: '1.0.0'
        },
        paths: {}
      };

      mockDereference.mockResolvedValue(futureSpec as unknown);

      // Act & Assert
      await expect(parseOpenAPISpec('future-spec.json')).rejects.toThrow(
        'Unsupported OpenAPI version: 4.0.0. Only OpenAPI 3.x is supported.'
      );
    });

    it('should wrap swagger-parser errors with context', async () => {
      // Arrange
      mockDereference.mockRejectedValue(new Error('Invalid reference: $ref pointer not found'));

      // Act & Assert
      await expect(parseOpenAPISpec('bad-refs.json')).rejects.toThrow(
        'Failed to parse OpenAPI spec: Invalid reference: $ref pointer not found'
      );
    });

    // -------------------------------------------------------------------------
    // EDGE CASE TESTS
    // -------------------------------------------------------------------------

    it('should throw validation error when spec has empty paths object', async () => {
      // Arrange
      const mockSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Empty Paths API',
          version: '1.0.0'
        },
        paths: {} // Empty - should fail validation
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act & Assert
      await expect(parseOpenAPISpec('empty-paths.json')).rejects.toThrow(
        'Failed to parse OpenAPI spec: OpenAPI spec missing required field: paths (must have at least one endpoint)'
      );
    });

    it('should handle spec with multiple HTTP methods on same path', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Multi-Method API',
          version: '1.0.0'
        },
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              responses: { '200': { description: 'Success' } }
            },
            post: {
              summary: 'Create user',
              responses: { '201': { description: 'Created' } }
            },
            put: {
              summary: 'Update user',
              responses: { '200': { description: 'Updated' } }
            },
            patch: {
              summary: 'Partial update',
              responses: { '200': { description: 'Updated' } }
            },
            delete: {
              summary: 'Delete user',
              responses: { '204': { description: 'Deleted' } }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('multi-method.json');

      // Assert
      expect(result.paths['/users']?.get).toBeDefined();
      expect(result.paths['/users']?.post).toBeDefined();
      expect(result.paths['/users']?.put).toBeDefined();
      expect(result.paths['/users']?.patch).toBeDefined();
      expect(result.paths['/users']?.delete).toBeDefined();
    });

    it('should preserve complex nested schemas after dereferencing', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Nested Schema API',
          version: '1.0.0'
        },
        paths: {
          '/data': {
            get: {
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          items: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                nested: {
                                  type: 'object',
                                  properties: {
                                    deepValue: { type: 'string' }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('nested.json');

      // Assert
      const schema =
        result.paths['/data']?.get?.responses['200']?.content?.['application/json']?.schema;
      expect(schema?.properties?.items).toBeDefined();
      expect(schema?.properties?.items?.items?.properties?.nested).toBeDefined();
    });

    it('should handle YAML file paths correctly', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'YAML API',
          version: '1.0.0'
        },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('openapi.yaml');

      // Assert
      expect(result.info.title).toBe('YAML API');
      expect(mockDereference).toHaveBeenCalledWith(
        'openapi.yaml',
        expect.objectContaining({
          resolve: expect.objectContaining({
            external: true,
            http: false
          })
        })
      );
    });

    it('should handle spec with various parameter types', async () => {
      // Arrange
      const mockSpec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Parameter Types API',
          version: '1.0.0'
        },
        paths: {
          '/test/{id}': {
            get: {
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                },
                {
                  name: 'filter',
                  in: 'query',
                  schema: { type: 'string' }
                },
                {
                  name: 'X-API-Key',
                  in: 'header',
                  schema: { type: 'string' }
                },
                {
                  name: 'session',
                  in: 'cookie',
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      mockDereference.mockResolvedValue(mockSpec as unknown);

      // Act
      const result = await parseOpenAPISpec('params.json');

      // Assert
      const params = result.paths['/test/{id}']?.get?.parameters;
      expect(params).toHaveLength(4);
      expect(params?.find((p) => p.in === 'path')).toBeDefined();
      expect(params?.find((p) => p.in === 'query')).toBeDefined();
      expect(params?.find((p) => p.in === 'header')).toBeDefined();
      expect(params?.find((p) => p.in === 'cookie')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // groupEndpointsByTags
  // ---------------------------------------------------------------------------
  describe('groupEndpointsByTags', () => {
    // -------------------------------------------------------------------------
    // HAPPY PATH TESTS
    // -------------------------------------------------------------------------

    it('should group endpoints by their tags', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              tags: ['Users'],
              summary: 'Get users',
              responses: { '200': { description: 'Success' } }
            }
          },
          '/products': {
            get: {
              tags: ['Products'],
              summary: 'Get products',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.size).toBe(2);
      expect(result.has('Users')).toBe(true);
      expect(result.has('Products')).toBe(true);
      expect(result.get('Users')).toHaveLength(1);
      expect(result.get('Products')).toHaveLength(1);
    });

    it('should group endpoint with multiple tags into each group', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/admin/users': {
            get: {
              tags: ['Admin', 'Users'],
              summary: 'Admin user management',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.size).toBe(2);
      expect(result.has('Admin')).toBe(true);
      expect(result.has('Users')).toBe(true);
      // Same endpoint appears in both groups
      expect(result.get('Admin')?.[0]?.path).toBe('/admin/users');
      expect(result.get('Users')?.[0]?.path).toBe('/admin/users');
    });

    it('should use "general" tag for endpoints without tags', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/health': {
            get: {
              summary: 'Health check',
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.size).toBe(1);
      expect(result.has('general')).toBe(true);
      expect(result.get('general')).toHaveLength(1);
      expect(result.get('general')?.[0]?.path).toBe('/health');
    });

    it('should use "general" tag for endpoints with empty tags array', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/info': {
            get: {
              tags: [], // Empty tags array
              summary: 'Get info',
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.size).toBe(1);
      expect(result.has('general')).toBe(true);
      expect(result.get('general')?.[0]?.path).toBe('/info');
    });

    it('should handle multiple HTTP methods on same path', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              tags: ['Users'],
              summary: 'List users',
              responses: { '200': { description: 'Success' } }
            },
            post: {
              tags: ['Users'],
              summary: 'Create user',
              responses: { '201': { description: 'Created' } }
            },
            delete: {
              tags: ['Users'],
              summary: 'Delete user',
              responses: { '204': { description: 'Deleted' } }
            }
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.size).toBe(1);
      expect(result.get('Users')).toHaveLength(3);
      const methods = result.get('Users')?.map((e) => e.method);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('DELETE');
    });

    it('should skip non-operation properties in path items', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            summary: 'Test endpoint', // Non-operation property
            description: 'Test description', // Non-operation property
            get: {
              tags: ['Test'],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.size).toBe(1);
      expect(result.get('Test')).toHaveLength(1); // Only 'get', not 'summary' or 'description'
    });

    // -------------------------------------------------------------------------
    // EDGE CASE TESTS
    // -------------------------------------------------------------------------

    it('should return empty map for spec with no paths', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.size).toBe(0);
    });

    it('should handle paths with only non-operation properties', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            summary: 'Only metadata',
            parameters: []
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.size).toBe(0);
    });

    it('should preserve endpoint details when grouping', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              tags: ['Users'],
              summary: 'Get user by ID',
              description: 'Retrieves a single user',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': { description: 'Success' },
                '404': { description: 'Not Found' }
              },
              security: [{ bearerAuth: [] }]
            }
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      const endpoint = result.get('Users')?.[0];
      expect(endpoint?.method).toBe('GET');
      expect(endpoint?.path).toBe('/users/{id}');
      expect(endpoint?.operationId).toBe('getUser');
      expect(endpoint?.summary).toBe('Get user by ID');
      expect(endpoint?.description).toBe('Retrieves a single user');
      expect(endpoint?.parameters).toHaveLength(1);
      expect(endpoint?.responses).toHaveProperty('200');
      expect(endpoint?.responses).toHaveProperty('404');
      expect(endpoint?.security).toHaveLength(1);
    });

    it('should handle all supported HTTP methods', () => {
      // Arrange
      const spec: IOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/resource': {
            get: {
              tags: ['API'],
              responses: { '200': { description: 'OK' } }
            },
            post: {
              tags: ['API'],
              responses: { '201': { description: 'Created' } }
            },
            put: {
              tags: ['API'],
              responses: { '200': { description: 'Updated' } }
            },
            patch: {
              tags: ['API'],
              responses: { '200': { description: 'Patched' } }
            },
            delete: {
              tags: ['API'],
              responses: { '204': { description: 'Deleted' } }
            },
            head: {
              tags: ['API'],
              responses: { '200': { description: 'OK' } }
            },
            options: {
              tags: ['API'],
              responses: { '200': { description: 'OK' } }
            },
            trace: {
              tags: ['API'],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      // Act
      const result = groupEndpointsByTags(spec);

      // Assert
      expect(result.get('API')).toHaveLength(8);
      const methods = result.get('API')?.map((e) => e.method);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('PATCH');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('HEAD');
      expect(methods).toContain('OPTIONS');
      expect(methods).toContain('TRACE');
    });
  });

  // ---------------------------------------------------------------------------
  // isOperation
  // ---------------------------------------------------------------------------
  describe('isOperation', () => {
    // -------------------------------------------------------------------------
    // HAPPY PATH TESTS
    // -------------------------------------------------------------------------

    it('should return true for "get" method', () => {
      expect(isOperation('get')).toBe(true);
    });

    it('should return true for "post" method', () => {
      expect(isOperation('post')).toBe(true);
    });

    it('should return true for "put" method', () => {
      expect(isOperation('put')).toBe(true);
    });

    it('should return true for "patch" method', () => {
      expect(isOperation('patch')).toBe(true);
    });

    it('should return true for "delete" method', () => {
      expect(isOperation('delete')).toBe(true);
    });

    // -------------------------------------------------------------------------
    // NEGATIVE TESTS
    // -------------------------------------------------------------------------

    it('should return false for "parameters" property', () => {
      expect(isOperation('parameters')).toBe(false);
    });

    it('should return false for "summary" property', () => {
      expect(isOperation('summary')).toBe(false);
    });

    it('should return false for "description" property', () => {
      expect(isOperation('description')).toBe(false);
    });

    it('should return false for "servers" property', () => {
      expect(isOperation('servers')).toBe(false);
    });

    it('should return true for "head" method', () => {
      expect(isOperation('head')).toBe(true);
    });

    it('should return true for "options" method', () => {
      expect(isOperation('options')).toBe(true);
    });

    it('should return true for "trace" method', () => {
      expect(isOperation('trace')).toBe(true);
    });

    // -------------------------------------------------------------------------
    // EDGE CASE TESTS
    // -------------------------------------------------------------------------

    it('should return false for empty string', () => {
      expect(isOperation('')).toBe(false);
    });

    it('should return false for uppercase method name', () => {
      expect(isOperation('GET')).toBe(false);
    });

    it('should return false for invalid method name', () => {
      expect(isOperation('invalid')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // createEndpointDoc
  // ---------------------------------------------------------------------------
  describe('createEndpointDoc', () => {
    // -------------------------------------------------------------------------
    // HAPPY PATH TESTS
    // -------------------------------------------------------------------------

    it('should create endpoint doc with all fields present', () => {
      // Arrange
      const operation = {
        operationId: 'getUser',
        summary: 'Get user',
        description: 'Get user by ID',
        parameters: [
          {
            name: 'id',
            in: 'path' as const,
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },
        responses: {
          '200': { description: 'Success' }
        },
        security: [{ bearerAuth: [] }]
      };

      // Act
      const result = createEndpointDoc('get', '/users/{id}', operation);

      // Assert
      expect(result.method).toBe('GET');
      expect(result.path).toBe('/users/{id}');
      expect(result.operationId).toBe('getUser');
      expect(result.summary).toBe('Get user');
      expect(result.description).toBe('Get user by ID');
      expect(result.parameters).toHaveLength(1);
      expect(result.requestBody).toBeDefined();
      expect(result.responses).toHaveProperty('200');
      expect(result.security).toHaveLength(1);
    });

    it('should uppercase HTTP method', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act
      const result = createEndpointDoc('post', '/test', operation);

      // Assert
      expect(result.method).toBe('POST');
    });

    // -------------------------------------------------------------------------
    // DEFAULT VALUE TESTS
    // -------------------------------------------------------------------------

    it('should generate operationId when not provided', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act
      const result = createEndpointDoc('get', '/users', operation);

      // Assert
      expect(result.operationId).toBe('get_/users');
    });

    it('should default summary to empty string when not provided', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act
      const result = createEndpointDoc('get', '/test', operation);

      // Assert
      expect(result.summary).toBe('');
    });

    it('should default description to empty string when not provided', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act
      const result = createEndpointDoc('get', '/test', operation);

      // Assert
      expect(result.description).toBe('');
    });

    it('should default parameters to empty array when not provided', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act
      const result = createEndpointDoc('get', '/test', operation);

      // Assert
      expect(result.parameters).toEqual([]);
    });

    it('should default security to empty array when not provided', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act
      const result = createEndpointDoc('get', '/test', operation);

      // Assert
      expect(result.security).toEqual([]);
    });

    it('should leave requestBody undefined when not provided', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act
      const result = createEndpointDoc('get', '/test', operation);

      // Assert
      expect(result.requestBody).toBeUndefined();
    });

    // -------------------------------------------------------------------------
    // EDGE CASE TESTS
    // -------------------------------------------------------------------------

    it('should handle complex path with parameters', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act
      const result = createEndpointDoc('get', '/users/{userId}/posts/{postId}', operation);

      // Assert
      expect(result.path).toBe('/users/{userId}/posts/{postId}');
      expect(result.operationId).toBe('get_/users/{userId}/posts/{postId}');
    });

    it('should handle all HTTP methods correctly', () => {
      // Arrange
      const operation = {
        responses: { '200': { description: 'OK' } }
      };

      // Act & Assert
      expect(createEndpointDoc('get', '/test', operation).method).toBe('GET');
      expect(createEndpointDoc('post', '/test', operation).method).toBe('POST');
      expect(createEndpointDoc('put', '/test', operation).method).toBe('PUT');
      expect(createEndpointDoc('patch', '/test', operation).method).toBe('PATCH');
      expect(createEndpointDoc('delete', '/test', operation).method).toBe('DELETE');
      expect(createEndpointDoc('head', '/test', operation).method).toBe('HEAD');
      expect(createEndpointDoc('options', '/test', operation).method).toBe('OPTIONS');
      expect(createEndpointDoc('trace', '/test', operation).method).toBe('TRACE');
    });

    it('should preserve responses object structure', () => {
      // Arrange
      const operation = {
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { type: 'object' }
              }
            }
          },
          '400': { description: 'Bad Request' },
          '404': { description: 'Not Found' }
        }
      };

      // Act
      const result = createEndpointDoc('get', '/test', operation);

      // Assert
      expect(result.responses).toHaveProperty('200');
      expect(result.responses).toHaveProperty('400');
      expect(result.responses).toHaveProperty('404');
      expect(result.responses['200']?.description).toBe('Success');
      expect(result.responses['200']?.content).toBeDefined();
    });
  });

  describe('isValidOpenAPIPath', () => {
    // Happy path tests
    it('should return true for valid path with leading slash', () => {
      expect(isValidOpenAPIPath('/users')).toBe(true);
    });

    it('should return true for valid path with parameters', () => {
      expect(isValidOpenAPIPath('/users/{id}')).toBe(true);
    });

    it('should return true for valid nested path', () => {
      expect(isValidOpenAPIPath('/v1/organizations/{orgId}/users/{userId}')).toBe(true);
    });

    it('should return true for root path', () => {
      expect(isValidOpenAPIPath('/')).toBe(true);
    });

    // Error cases - missing leading slash
    it('should return false for path without leading slash', () => {
      expect(isValidOpenAPIPath('users')).toBe(false);
    });

    it('should return false for path starting with non-slash', () => {
      expect(isValidOpenAPIPath('api/users')).toBe(false);
    });

    // Error cases - consecutive slashes
    it('should return false for path with consecutive slashes', () => {
      expect(isValidOpenAPIPath('/users//list')).toBe(false);
    });

    it('should return false for path with multiple consecutive slashes', () => {
      expect(isValidOpenAPIPath('///users')).toBe(false);
    });

    // Error cases - path traversal
    it('should return false for path with parent directory traversal', () => {
      expect(isValidOpenAPIPath('/users/../admin')).toBe(false);
    });

    it('should return false for path with path traversal sequence', () => {
      expect(isValidOpenAPIPath('/../etc/passwd')).toBe(false);
    });

    // Edge cases - whitespace
    it('should return false for empty string', () => {
      expect(isValidOpenAPIPath('')).toBe(false);
    });

    it('should return false for whitespace-only string', () => {
      expect(isValidOpenAPIPath('   ')).toBe(false);
    });
  });
});
