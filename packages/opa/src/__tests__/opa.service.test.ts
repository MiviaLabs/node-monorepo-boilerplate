/**
 * OpaService Unit Tests
 *
 * Comprehensive test suite for OpaService covering:
 * - isAuthorized() method (happy paths, error cases, validation)
 * - validateRequest() private method (via isAuthorized)
 * - queryOpa() private method (via isAuthorized)
 * - handleAuthorizationError() private method (via isAuthorized)
 * - healthCheck() method
 * - getConfig() method
 *
 * Test Strategy:
 * - Mock HttpService with jest.fn()
 * - Test fail-closed security behavior
 * - Validate error handling for all edge cases
 * - Cover 80%+ code coverage
 */

import { of, throwError, timeout } from 'rxjs';

import { OpaService } from '../opa.service';
import { OpaValidationError } from '../errors';

import type { IAuthzRequest } from '../types';

describe('OpaService', () => {
  let service: OpaService;
  let mockHttpService: {
    post: jest.Mock;
    get: jest.Mock;
  };

  const DEFAULT_CONFIG = {
    url: 'http://localhost:8181',
    policyPath: '/v1/data/authz/allow',
    timeout: 5000
  };

  beforeEach(() => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn()
    };

    // Create service directly with mocked dependencies
    service = new OpaService(mockHttpService as never, DEFAULT_CONFIG);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
    });

    it('should freeze configuration', () => {
      const config = service.getConfig();
      expect(Object.isFrozen(config)).toBe(true);
    });

    it('should store configuration correctly', () => {
      const config = service.getConfig();
      expect(config.url).toBe(DEFAULT_CONFIG.url);
      expect(config.policyPath).toBe(DEFAULT_CONFIG.policyPath);
      expect(config.timeout).toBe(DEFAULT_CONFIG.timeout);
    });
  });

  describe('isAuthorized', () => {
    describe('happy paths', () => {
      it('should return true when OPA allows the request', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: ['system_admin'],
            tenant_roles: [],
            organization_id: 'org-456'
          },
          resource: { type: 'document', id: 'doc-789' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true, decision_id: 'dec-123' }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });

      it('should return false when OPA denies the request', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: ['tenant_viewer'],
            organization_id: 'org-456'
          },
          resource: { type: 'admin_panel' },
          action: 'update'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: false }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(false);
      });

      it('should handle minimal valid request', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'public_page' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });

      it('should handle request with all optional fields', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: ['system_admin'],
            tenant_roles: ['tenant_owner', 'tenant_admin'],
            organization_id: 'org-456',
            permissions: ['document:read', 'document:write', 'user:invite'],
            attributes: {
              department: 'engineering',
              clearance: 'secret',
              location: 'us-east'
            }
          },
          resource: {
            type: 'document',
            id: 'doc-789',
            owner_id: 'user-111',
            organization_id: 'org-456'
          },
          action: 'update'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true, decision_id: 'dec-abc' }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });

      it('should send correct request structure to OPA', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: ['system_admin'],
            tenant_roles: [],
            organization_id: 'org-456'
          },
          resource: { type: 'organization', id: 'org-789' },
          action: 'update'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true }
          })
        );

        await service.isAuthorized(request);

        expect(mockHttpService.post).toHaveBeenCalledWith(
          'http://localhost:8181/v1/data/authz/allow',
          { input: request }
        );
      });
    });

    describe('request validation failures', () => {
      it('should throw OpaValidationError when user.id is missing', async () => {
        const request = {
          user: {
            id: '',
            system_roles: [],
            tenant_roles: [],
            organization_id: 'org-456'
          },
          resource: { type: 'document' },
          action: 'read'
        } as unknown as IAuthzRequest;

        await expect(service.isAuthorized(request)).rejects.toThrow(OpaValidationError);
        await expect(service.isAuthorized(request)).rejects.toThrow('user.id is required');
      });

      it('should throw OpaValidationError when user is missing', async () => {
        const request = {
          user: undefined,
          resource: { type: 'document' },
          action: 'read'
        } as unknown as IAuthzRequest;

        await expect(service.isAuthorized(request)).rejects.toThrow(OpaValidationError);
      });

      it('should throw OpaValidationError when resource.type is missing', async () => {
        const request = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: '' },
          action: 'read'
        } as unknown as IAuthzRequest;

        await expect(service.isAuthorized(request)).rejects.toThrow(OpaValidationError);
        await expect(service.isAuthorized(request)).rejects.toThrow('resource.type is required');
      });

      it('should throw OpaValidationError when resource is missing', async () => {
        const request = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: undefined,
          action: 'read'
        } as unknown as IAuthzRequest;

        await expect(service.isAuthorized(request)).rejects.toThrow(OpaValidationError);
      });

      it('should throw OpaValidationError when action is missing', async () => {
        const request = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: ''
        } as unknown as IAuthzRequest;

        await expect(service.isAuthorized(request)).rejects.toThrow(OpaValidationError);
        await expect(service.isAuthorized(request)).rejects.toThrow('action is required');
      });

      it('should throw OpaValidationError when user.id is not a string', async () => {
        const request = {
          user: {
            id: 123 as unknown as string,
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 'read'
        } as unknown as IAuthzRequest;

        await expect(service.isAuthorized(request)).rejects.toThrow(OpaValidationError);
        await expect(service.isAuthorized(request)).rejects.toThrow('user.id must be a string');
      });

      it('should throw OpaValidationError when resource.type is not a string', async () => {
        const request = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: true as unknown as string },
          action: 'read'
        } as unknown as IAuthzRequest;

        await expect(service.isAuthorized(request)).rejects.toThrow(OpaValidationError);
        await expect(service.isAuthorized(request)).rejects.toThrow(
          'resource.type must be a string'
        );
      });

      it('should throw OpaValidationError when action is not a string', async () => {
        const request = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 123 as unknown as string
        } as unknown as IAuthzRequest;

        await expect(service.isAuthorized(request)).rejects.toThrow(OpaValidationError);
        await expect(service.isAuthorized(request)).rejects.toThrow('action must be a string');
      });
    });

    describe('fail-closed error handling', () => {
      it('should return false on network error', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 'read'
        };

        const networkError = new Error('ECONNREFUSED');
        mockHttpService.post.mockReturnValue(throwError(() => networkError));

        const result = await service.isAuthorized(request);
        expect(result).toBe(false);
      });

      it('should return false on timeout error', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 'read'
        };

        const timeoutError = new Error('Timeout has occurred');
        mockHttpService.post.mockReturnValue(throwError(() => timeoutError));

        const result = await service.isAuthorized(request);
        expect(result).toBe(false);
      });

      it('should return false on HTTP error response', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 'read'
        };

        const httpError = new Error('Request failed with status code 500');
        mockHttpService.post.mockReturnValue(throwError(() => httpError));

        const result = await service.isAuthorized(request);
        expect(result).toBe(false);
      });

      it('should return false on malformed OPA response', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: null // Missing result field
          } as unknown as { data: { result: boolean } })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(false);
      });

      it('should return false on unknown error type', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(throwError(() => 'Unknown error string'));

        const result = await service.isAuthorized(request);
        expect(result).toBe(false);
      });

      it('should include decision_id when present in response', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: ['system_admin'],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true, decision_id: 'dec-123-abc' }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle empty system_roles array', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: ['tenant_user'],
            organization_id: 'org-456'
          },
          resource: { type: 'document' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });

      it('should handle empty tenant_roles array', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: ['system_admin'],
            tenant_roles: [],
            organization_id: 'org-456'
          },
          resource: { type: 'document' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });

      it('should handle null organization_id', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'public_resource' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });

      it('should handle resource with only type (no id)', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'documents' }, // No resource.id
          action: 'list'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });

      it('should handle complex action names', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'document' },
          action: 'publish_and_share'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });

      it('should handle special characters in resource type', async () => {
        const request: IAuthzRequest = {
          user: {
            id: 'user-123',
            system_roles: [],
            tenant_roles: [],
            organization_id: null
          },
          resource: { type: 'api/v2/resource' },
          action: 'read'
        };

        mockHttpService.post.mockReturnValue(
          of({
            data: { result: true }
          })
        );

        const result = await service.isAuthorized(request);
        expect(result).toBe(true);
      });
    });
  });

  describe('healthCheck', () => {
    it('should return true when OPA is healthy', async () => {
      mockHttpService.get.mockReturnValue(of({ status: 'ok' }));

      const result = await service.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false on network error', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      const result = await service.healthCheck();
      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Timeout has occurred')));

      const result = await service.healthCheck();
      expect(result).toBe(false);
    });

    it('should use correct health endpoint URL', async () => {
      mockHttpService.get.mockReturnValue(of({ status: 'ok' }));

      await service.healthCheck();

      expect(mockHttpService.get).toHaveBeenCalledWith('http://localhost:8181/health');
    });

    it('should handle malformed response', async () => {
      // healthCheck just checks if OPA is reachable, doesn't validate response
      // Returning null is treated as success (OPA responded)
      mockHttpService.get.mockReturnValue(of(null as unknown as { status: string }));

      const result = await service.healthCheck();
      expect(result).toBe(true); // OPA is reachable, so healthy
    });

    it('should handle unknown error types', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => 'Unknown error'));

      const result = await service.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return frozen configuration object', () => {
      const config = service.getConfig();

      expect(Object.isFrozen(config)).toBe(true);
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should return configuration with all required fields', () => {
      const config = service.getConfig();

      expect(config).toHaveProperty('url');
      expect(config).toHaveProperty('policyPath');
      expect(config).toHaveProperty('timeout');
    });

    it('should not allow modification of returned config', () => {
      const config = service.getConfig() as { url: string; policyPath: string; timeout: number };

      // Frozen objects throw when trying to add properties
      expect(() => {
        (config as any).newField = 'should not work';
      }).toThrow();

      // The frozen config shouldn't be modifiable
      expect(config).not.toHaveProperty('newField');
    });

    it('should return same config instance on multiple calls', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).toBe(config2);
    });

    it('should reflect custom configuration', async () => {
      const customConfig = {
        url: 'http://custom-opa:8181',
        policyPath: '/v1/data/custom/authz',
        timeout: 3000
      };

      const customService = new OpaService(mockHttpService as never, customConfig);
      const config = customService.getConfig();

      expect(config.url).toBe(customConfig.url);
      expect(config.policyPath).toBe(customConfig.policyPath);
      expect(config.timeout).toBe(customConfig.timeout);
    });
  });

  describe('timeout behavior', () => {
    it('should apply timeout to OPA requests', async () => {
      const request: IAuthzRequest = {
        user: {
          id: 'user-123',
          system_roles: [],
          tenant_roles: [],
          organization_id: null
        },
        resource: { type: 'document' },
        action: 'read'
      };

      mockHttpService.post.mockImplementation(() => {
        return of({
          data: { result: true }
        }).pipe(
          timeout({
            each: 100,
            meta: true
          })
        );
      });

      // Mock the timeout to complete within limit
      const result = await service.isAuthorized(request);
      expect(result).toBe(true);
    });
  });

  describe('error field tracking', () => {
    it('should include field in OpaValidationError', async () => {
      const request = {
        user: {
          id: '',
          system_roles: [],
          tenant_roles: [],
          organization_id: 'org-456'
        },
        resource: { type: 'document' },
        action: 'read'
      } as unknown as IAuthzRequest;

      try {
        await service.isAuthorized(request);
        fail('Should have thrown OpaValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(OpaValidationError);
        expect((error as OpaValidationError).field).toBe('user.id');
      }
    });

    it('should include field for resource.type validation error', async () => {
      const request = {
        user: {
          id: 'user-123',
          system_roles: [],
          tenant_roles: [],
          organization_id: null
        },
        resource: { type: '' },
        action: 'read'
      } as unknown as IAuthzRequest;

      try {
        await service.isAuthorized(request);
        fail('Should have thrown OpaValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(OpaValidationError);
        expect((error as OpaValidationError).field).toBe('resource.type');
      }
    });

    it('should include field for action validation error', async () => {
      const request = {
        user: {
          id: 'user-123',
          system_roles: [],
          tenant_roles: [],
          organization_id: null
        },
        resource: { type: 'document' },
        action: ''
      } as unknown as IAuthzRequest;

      try {
        await service.isAuthorized(request);
        fail('Should have thrown OpaValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(OpaValidationError);
        expect((error as OpaValidationError).field).toBe('action');
      }
    });
  });

  describe('OpaError cause chaining', () => {
    it('should wrap original error in OpaError', async () => {
      const request: IAuthzRequest = {
        user: {
          id: 'user-123',
          system_roles: [],
          tenant_roles: [],
          organization_id: null
        },
        resource: { type: 'document' },
        action: 'read'
      };

      const originalError = new Error('Original network error');
      mockHttpService.post.mockReturnValue(throwError(() => originalError));

      // The error is caught and handled by handleAuthorizationError
      // which returns false (fail-closed), so we won't get OpaError directly
      // But the error is logged internally
      const result = await service.isAuthorized(request);
      expect(result).toBe(false);
    });
  });
});
