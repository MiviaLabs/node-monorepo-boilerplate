/**
 * System Module DTO Unit Tests
 *
 * Tests DTO validation using class-validator.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - CreateTenantDto validation
 * - UpdateTenantDto validation
 * - TenantResponseDto.fromEntity()
 * - SystemSettingsDto validation
 * - PasswordPolicyDto validation
 * - SystemMetricsDto structure
 * - DeadLetterEventDto structure
 * - ReplayDeadLetterResponseDto structure
 * - QueryDeadLetterEventsDto validation
 */

import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  DeadLetterEventDto,
  ReplayDeadLetterResponseDto,
  QueryDeadLetterEventsDto
} from '../dead-letter.dto';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TenantResponseDto,
  SystemSettingsDto,
  SystemMetricsDto
} from '../index';

import type { ValidationError } from 'class-validator';

/**
 * Helper function to validate DTO and return errors
 */
async function validateDto<T extends object>(
  DtoClass: new () => T,
  data: Record<string, unknown>
): Promise<ValidationError[]> {
  const instance = plainToInstance(DtoClass, data);
  return validate(instance);
}

describe('CreateTenantDto', () => {
  describe('name', () => {
    it('should accept valid tenant name', async () => {
      const errors = await validateDto(CreateTenantDto, {
        name: 'Acme Corp',
        slug: 'acme-corp'
      });

      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors).toHaveLength(0);
    });

    it('should reject empty name', async () => {
      const errors = await validateDto(CreateTenantDto, {
        name: '',
        slug: 'test'
      });

      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });

    it('should reject name shorter than 2 characters', async () => {
      const errors = await validateDto(CreateTenantDto, {
        name: 'A',
        slug: 'test'
      });

      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });

    it('should reject missing name', async () => {
      const errors = await validateDto(CreateTenantDto, {
        slug: 'test'
      });

      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });
  });

  describe('slug', () => {
    it('should accept valid slug format', async () => {
      const validSlugs = ['acme-corp', 'test-tenant', 'tenant123', 'my-organization'];

      for (const slug of validSlugs) {
        const errors = await validateDto(CreateTenantDto, {
          name: 'Test',
          slug
        });

        const slugErrors = errors.filter((e) => e.property === 'slug');
        expect(slugErrors).toHaveLength(0);
      }
    });

    it('should reject slug with uppercase letters', async () => {
      const errors = await validateDto(CreateTenantDto, {
        name: 'Test',
        slug: 'Acme-Corp'
      });

      const slugErrors = errors.filter((e) => e.property === 'slug');
      expect(slugErrors.length).toBeGreaterThan(0);
    });

    it('should reject slug with special characters', async () => {
      const errors = await validateDto(CreateTenantDto, {
        name: 'Test',
        slug: 'acme_corp'
      });

      const slugErrors = errors.filter((e) => e.property === 'slug');
      expect(slugErrors.length).toBeGreaterThan(0);
    });

    it('should reject slug with spaces', async () => {
      const errors = await validateDto(CreateTenantDto, {
        name: 'Test',
        slug: 'acme corp'
      });

      const slugErrors = errors.filter((e) => e.property === 'slug');
      expect(slugErrors.length).toBeGreaterThan(0);
    });

    it('should reject empty slug', async () => {
      const errors = await validateDto(CreateTenantDto, {
        name: 'Test',
        slug: ''
      });

      const slugErrors = errors.filter((e) => e.property === 'slug');
      expect(slugErrors.length).toBeGreaterThan(0);
    });

    it('should reject missing slug', async () => {
      const errors = await validateDto(CreateTenantDto, {
        name: 'Test'
      });

      const slugErrors = errors.filter((e) => e.property === 'slug');
      expect(slugErrors.length).toBeGreaterThan(0);
    });
  });
});

describe('UpdateTenantDto', () => {
  describe('name (optional)', () => {
    it('should accept valid name', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        name: 'Updated Name'
      });

      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors).toHaveLength(0);
    });

    it('should reject name shorter than 2 characters', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        name: 'A'
      });

      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });

    it('should allow missing name', async () => {
      const errors = await validateDto(UpdateTenantDto, {});

      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors).toHaveLength(0);
    });
  });

  describe('status (optional)', () => {
    it('should accept valid status values', async () => {
      const validStatuses = ['active', 'suspended', 'deleted'];

      for (const status of validStatuses) {
        const errors = await validateDto(UpdateTenantDto, {
          status
        });

        const statusErrors = errors.filter((e) => e.property === 'status');
        expect(statusErrors).toHaveLength(0);
      }
    });

    it('should reject invalid status', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        status: 'invalid'
      });

      const statusErrors = errors.filter((e) => e.property === 'status');
      expect(statusErrors.length).toBeGreaterThan(0);
    });

    it('should allow missing status', async () => {
      const errors = await validateDto(UpdateTenantDto, {});

      const statusErrors = errors.filter((e) => e.property === 'status');
      expect(statusErrors).toHaveLength(0);
    });
  });

  describe('slug (optional)', () => {
    it('should accept valid slug format', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        slug: 'updated-slug'
      });

      const slugErrors = errors.filter((e) => e.property === 'slug');
      expect(slugErrors).toHaveLength(0);
    });

    it('should reject slug with uppercase letters', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        slug: 'Updated-Slug'
      });

      const slugErrors = errors.filter((e) => e.property === 'slug');
      expect(slugErrors.length).toBeGreaterThan(0);
    });

    it('should allow missing slug', async () => {
      const errors = await validateDto(UpdateTenantDto, {});

      const slugErrors = errors.filter((e) => e.property === 'slug');
      expect(slugErrors).toHaveLength(0);
    });
  });

  describe('partial updates', () => {
    it('should allow updating only name', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        name: 'New Name'
      });

      expect(errors.filter((e) => e.property === 'name')).toHaveLength(0);
    });

    it('should allow updating only status', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        status: 'suspended'
      });

      expect(errors.filter((e) => e.property === 'status')).toHaveLength(0);
    });

    it('should allow updating only slug', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        slug: 'new-slug'
      });

      expect(errors.filter((e) => e.property === 'slug')).toHaveLength(0);
    });

    it('should allow updating multiple fields', async () => {
      const errors = await validateDto(UpdateTenantDto, {
        name: 'New Name',
        status: 'active',
        slug: 'new-slug'
      });

      expect(errors.filter((e) => e.property === 'name')).toHaveLength(0);
      expect(errors.filter((e) => e.property === 'status')).toHaveLength(0);
      expect(errors.filter((e) => e.property === 'slug')).toHaveLength(0);
    });

    it('should allow empty DTO (no updates)', async () => {
      const errors = await validateDto(UpdateTenantDto, {});

      expect(errors).toHaveLength(0);
    });
  });
});

describe('TenantResponseDto', () => {
  describe('fromEntity', () => {
    it('should create response DTO from entity', () => {
      // Arrange
      const entity = {
        id: 1,
        name: 'Acme Corp',
        slug: 'acme-corp',
        status: 'active',
        createdAt: new Date('2024-01-01T12:00:00.000Z'),
        updatedAt: new Date('2024-01-01T12:00:00.000Z')
      };

      // Act
      const result = TenantResponseDto.fromEntity(entity);

      // Assert
      expect(result.id).toBe(entity.id);
      expect(result.name).toBe(entity.name);
      expect(result.slug).toBe(entity.slug);
      expect(result.status).toBe(entity.status);
      expect(result.createdAt).toEqual(entity.createdAt);
      expect(result.updatedAt).toEqual(entity.updatedAt);
    });

    it('should handle entity without updatedAt', () => {
      // Arrange
      const entity = {
        id: 2,
        name: 'Test Tenant',
        slug: 'test-tenant',
        status: 'suspended',
        createdAt: new Date('2024-01-01T12:00:00.000Z')
      };

      // Act
      const result = TenantResponseDto.fromEntity(entity);

      // Assert
      expect(result.updatedAt).toBeUndefined();
    });

    it('should cast status to valid type', () => {
      // Arrange
      const entity = {
        id: 3,
        name: 'Test',
        slug: 'test',
        status: 'deleted',
        createdAt: new Date()
      };

      // Act
      const result = TenantResponseDto.fromEntity(entity);

      // Assert
      expect(['active', 'suspended', 'deleted'] as const).toContain(result.status);
    });
  });
});

describe('SystemSettingsDto', () => {
  describe('password policy validation', () => {
    it('should accept valid password policy', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false
        }
      });

      const policyErrors = errors.filter((e) => e.property === 'passwordPolicy');
      expect(policyErrors).toHaveLength(0);
    });

    it('should enforce minLength minimum of 8', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        passwordPolicy: {
          minLength: 5
        }
      });

      const policyErrors = errors.filter((e) => e.property === 'passwordPolicy');
      expect(policyErrors.length).toBeGreaterThan(0);
    });

    it('should allow minLength of exactly 8', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        passwordPolicy: {
          minLength: 8
        }
      });

      const policyErrors = errors.filter((e) => e.property === 'passwordPolicy');
      expect(policyErrors).toHaveLength(0);
    });

    it('should allow large minLength values', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        passwordPolicy: {
          minLength: 128
        }
      });

      const policyErrors = errors.filter((e) => e.property === 'passwordPolicy');
      expect(policyErrors).toHaveLength(0);
    });
  });

  describe('session timeout validation', () => {
    it('should enforce minimum of 60 seconds', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        sessionTimeout: 30
      });

      const timeoutErrors = errors.filter((e) => e.property === 'sessionTimeout');
      expect(timeoutErrors.length).toBeGreaterThan(0);
    });

    it('should allow session timeout of 60 seconds', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        sessionTimeout: 60
      });

      const timeoutErrors = errors.filter((e) => e.property === 'sessionTimeout');
      expect(timeoutErrors).toHaveLength(0);
    });

    it('should allow large session timeout values', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        sessionTimeout: 86400
      });

      const timeoutErrors = errors.filter((e) => e.property === 'sessionTimeout');
      expect(timeoutErrors).toHaveLength(0);
    });
  });

  describe('max tenants validation', () => {
    it('should enforce minimum of 1', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        maxTenantsPerUser: 0
      });

      const maxTenantsErrors = errors.filter((e) => e.property === 'maxTenantsPerUser');
      expect(maxTenantsErrors.length).toBeGreaterThan(0);
    });

    it('should allow maxTenantsPerUser of 1', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        maxTenantsPerUser: 1
      });

      const maxTenantsErrors = errors.filter((e) => e.property === 'maxTenantsPerUser');
      expect(maxTenantsErrors).toHaveLength(0);
    });

    it('should allow large maxTenantsPerUser values', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        maxTenantsPerUser: 1000
      });

      const maxTenantsErrors = errors.filter((e) => e.property === 'maxTenantsPerUser');
      expect(maxTenantsErrors).toHaveLength(0);
    });
  });

  describe('optional fields', () => {
    it('should allow all fields to be optional', async () => {
      const errors = await validateDto(SystemSettingsDto, {});

      expect(errors).toHaveLength(0);
    });

    it('should allow partial updates', async () => {
      const errors = await validateDto(SystemSettingsDto, {
        allowRegistration: false
      });

      expect(errors).toHaveLength(0);
    });
  });
});

describe('QueryDeadLetterEventsDto', () => {
  describe('tenantId (optional)', () => {
    it('should accept valid tenantId', async () => {
      const errors = await validateDto(QueryDeadLetterEventsDto, {
        tenantId: 'primary-encryption-key'
      });

      const tenantIdErrors = errors.filter((e) => e.property === 'tenantId');
      expect(tenantIdErrors).toHaveLength(0);
    });

    it('should allow missing tenantId', async () => {
      const errors = await validateDto(QueryDeadLetterEventsDto, {});

      const tenantIdErrors = errors.filter((e) => e.property === 'tenantId');
      expect(tenantIdErrors).toHaveLength(0);
    });
  });

  describe('eventType (optional)', () => {
    it('should accept valid eventType', async () => {
      const errors = await validateDto(QueryDeadLetterEventsDto, {
        eventType: 'user.created'
      });

      const eventTypeErrors = errors.filter((e) => e.property === 'eventType');
      expect(eventTypeErrors).toHaveLength(0);
    });

    it('should allow missing eventType', async () => {
      const errors = await validateDto(QueryDeadLetterEventsDto, {});

      const eventTypeErrors = errors.filter((e) => e.property === 'eventType');
      expect(eventTypeErrors).toHaveLength(0);
    });
  });

  describe('reason (optional)', () => {
    it('should accept valid reason values', async () => {
      const validReasons = ['network', 'timeout', 'validation', 'permission', 'unknown'];

      for (const reason of validReasons) {
        const errors = await validateDto(QueryDeadLetterEventsDto, {
          reason
        });

        const reasonErrors = errors.filter((e) => e.property === 'reason');
        expect(reasonErrors).toHaveLength(0);
      }
    });

    it('should allow missing reason', async () => {
      const errors = await validateDto(QueryDeadLetterEventsDto, {});

      const reasonErrors = errors.filter((e) => e.property === 'reason');
      expect(reasonErrors).toHaveLength(0);
    });
  });

  describe('combined filters', () => {
    it('should allow multiple filters', async () => {
      const errors = await validateDto(QueryDeadLetterEventsDto, {
        tenantId: 'primary-encryption-key',
        eventType: 'user.created',
        reason: 'validation'
      });

      expect(errors).toHaveLength(0);
    });

    it('should allow no filters', async () => {
      const errors = await validateDto(QueryDeadLetterEventsDto, {});

      expect(errors).toHaveLength(0);
    });
  });
});

describe('SystemMetricsDto structure', () => {
  it('should be instantiable', () => {
    const dto = new SystemMetricsDto();
    expect(dto).toBeInstanceOf(SystemMetricsDto);
  });

  it('should accept timestamp property', () => {
    const dto: SystemMetricsDto = { timestamp: '2024-01-01T00:00:00.000Z' } as SystemMetricsDto;
    expect(dto.timestamp).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should accept uptime property', () => {
    const dto: SystemMetricsDto = { uptime: 100 } as SystemMetricsDto;
    expect(dto.uptime).toBe(100);
  });

  it('should accept memory property', () => {
    const memory: NodeJS.MemoryUsage = {
      rss: 1000000,
      heapTotal: 500000,
      heapUsed: 250000,
      external: 50000,
      arrayBuffers: 10000
    };
    const dto: SystemMetricsDto = { memory } as SystemMetricsDto;
    expect(dto.memory).toEqual(memory);
  });

  it('should accept tenants property', () => {
    const tenants = { total: 10, active: 8, suspended: 2 };
    const dto: SystemMetricsDto = { tenants } as SystemMetricsDto;
    expect(dto.tenants).toEqual(tenants);
  });

  it('should accept users property', () => {
    const users = { total: 100, active: 90, inactive: 10 };
    const dto: SystemMetricsDto = { users } as SystemMetricsDto;
    expect(dto.users).toEqual(users);
  });

  it('should accept requests property', () => {
    const requests = { total: 10000, perMinute: 150 };
    const dto: SystemMetricsDto = { requests } as SystemMetricsDto;
    expect(dto.requests).toEqual(requests);
  });
});

describe('DeadLetterEventDto structure', () => {
  it('should have eventId property', () => {
    const dto = new DeadLetterEventDto();
    expect(dto).toHaveProperty('eventId');
  });

  it('should have eventType property', () => {
    const dto = new DeadLetterEventDto();
    expect(dto).toHaveProperty('eventType');
  });

  it('should have aggregateId property', () => {
    const dto = new DeadLetterEventDto();
    expect(dto).toHaveProperty('aggregateId');
  });

  it('should have tenantId property', () => {
    const dto = new DeadLetterEventDto();
    expect(dto).toHaveProperty('tenantId');
  });

  it('should have retryCount property', () => {
    const dto = new DeadLetterEventDto();
    expect(dto).toHaveProperty('retryCount');
  });

  it('should have errorMessage property', () => {
    const dto = new DeadLetterEventDto();
    expect(dto).toHaveProperty('errorMessage');
  });

  it('should have deadLetteredAt property', () => {
    const dto = new DeadLetterEventDto();
    expect(dto).toHaveProperty('deadLetteredAt');
  });

  it('should have reason property', () => {
    const dto = new DeadLetterEventDto();
    expect(dto).toHaveProperty('reason');
  });
});

describe('ReplayDeadLetterResponseDto structure', () => {
  it('should have eventId property', () => {
    const dto = new ReplayDeadLetterResponseDto();
    expect(dto).toHaveProperty('eventId');
  });

  it('should have success property', () => {
    const dto = new ReplayDeadLetterResponseDto();
    expect(dto).toHaveProperty('success');
  });

  it('should have message property', () => {
    const dto = new ReplayDeadLetterResponseDto();
    expect(dto).toHaveProperty('message');
  });
});
