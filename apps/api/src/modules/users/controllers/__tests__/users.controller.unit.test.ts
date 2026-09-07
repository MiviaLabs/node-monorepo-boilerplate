/**
 * PeopleController Unit Tests
 *
 * Tests the PeopleController HTTP layer.
 * Mocks the QueryBus to isolate controller logic.
 */

import { Reflector } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CachedPermissionService,
  EnhancedPermissionsGuard as BaseEnhancedPermissionsGuard
} from '@package/auth';
import { Errors } from '@package/errors';

import { PeopleController } from '../../controllers/users.controller';
import { QueryUsersDto } from '../../dto';

import type { TestingModule } from '@nestjs/testing';

import { BaseResponseDto } from '@/common/dtos';
import { JwtAuthGuard } from '@/modules/auth/guards';

describe('PeopleController', () => {
  let controller: PeopleController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  const mockUserResponse = {
    id: 1,
    organizationId: 123,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z')
  };

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
      getAll: jest.fn()
    };

    const mockCachedPermissionService = {
      getCachedPermissions: jest.fn().mockResolvedValue([]),
      invalidateCache: jest.fn().mockResolvedValue(undefined)
    };

    // Create a mock instance of the base guard
    const mockBaseGuard = {
      canActivate: jest.fn().mockReturnValue(true)
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PeopleController],
      imports: [
        JwtModule.register({
          secret: 'test-jwt-secret-key-with-32-chars-min',
          signOptions: { expiresIn: '1h' }
        })
      ],
      providers: [
        {
          provide: Reflector,
          useValue: mockReflector
        },
        {
          provide: CachedPermissionService,
          useValue: mockCachedPermissionService
        },
        // Provide base guard mock - local wrapper will extend this
        {
          provide: BaseEnhancedPermissionsGuard,
          useValue: mockBaseGuard
        },
        {
          provide: QueryBus,
          useValue: {
            execute: jest.fn()
          }
        },
        {
          provide: CommandBus,
          useValue: {
            execute: jest.fn()
          }
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(BaseEnhancedPermissionsGuard)
      .useValue(mockBaseGuard)
      .compile();

    controller = module.get<PeopleController>(PeopleController);
    // Cast to any to bypass jest.Mocked type issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryBus = module.get<QueryBus>(QueryBus) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    commandBus = module.get<CommandBus>(CommandBus) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return user wrapped in BaseResponseDto', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue(mockUserResponse);

      // Act
      const result = await controller.findOne('123', 1);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual(mockUserResponse);
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          userId: 1
        })
      );
    });

    it('should throw VAL_002 error for invalid tenant ID (NaN)', async () => {
      // Arrange
      const expectedError = Errors.validationinvalidValueFor002({
        field: 'x-tenant-id',
        expectedType: 'integer'
      });

      // Act & Assert
      await expect(controller.findOne('invalid', 1)).rejects.toThrow(expectedError);
      expect(queryBus.execute).not.toHaveBeenCalled();
    });

    it('should throw VAL_002 error for non-numeric tenant ID', async () => {
      // Arrange & Act & Assert
      await expect(controller.findOne('abc', 1)).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'x-tenant-id',
          expectedType: 'integer'
        })
      );
      expect(queryBus.execute).not.toHaveBeenCalled();
    });

    it('should parse tenant ID string to integer', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue(mockUserResponse);

      // Act
      await controller.findOne('456', 1);

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 456
        })
      );
    });

    it('should propagate DB_004 error when user not found', async () => {
      // Arrange
      const notFoundError = Errors.databaserecordNotFound004({ entity: 'User' });
      queryBus.execute.mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(controller.findOne('123', 999)).rejects.toThrow(notFoundError);
      expect(queryBus.execute).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      // Arrange
      const mockPaginatedResponse = {
        data: [mockUserResponse],
        metadata: {
          pagination: {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false
          },
          timestamp: new Date()
        }
      };
      queryBus.execute.mockResolvedValue(mockPaginatedResponse);

      const queryDto = new QueryUsersDto();
      // Use Object.assign to bypass readonly properties
      Object.assign(queryDto, { page: 1, pageSize: 20 });

      // Act
      const result = await controller.findAll('123', queryDto);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          page: 1,
          pageSize: 20
        })
      );
    });

    it('should throw VAL_002 error for invalid tenant ID', async () => {
      // Arrange
      const queryDto = new QueryUsersDto();

      // Act & Assert
      await expect(controller.findAll('invalid', queryDto)).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'x-tenant-id',
          expectedType: 'integer'
        })
      );
      expect(queryBus.execute).not.toHaveBeenCalled();
    });

    it('should use default pagination when not provided', async () => {
      // Arrange
      const mockPaginatedResponse = {
        data: [],
        metadata: {
          pagination: {
            page: 1,
            pageSize: 20,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: false
          },
          timestamp: new Date()
        }
      };
      queryBus.execute.mockResolvedValue(mockPaginatedResponse);

      const queryDto = new QueryUsersDto();
      // page and pageSize are undefined

      // Act
      await controller.findAll('123', queryDto);

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123
        })
      );
    });

    it('should pass query params to query bus', async () => {
      // Arrange
      const mockPaginatedResponse = {
        data: [],
        metadata: {
          pagination: {
            page: 2,
            pageSize: 5,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: true
          },
          timestamp: new Date()
        }
      };
      queryBus.execute.mockResolvedValue(mockPaginatedResponse);

      const queryDto = new QueryUsersDto();
      // Use Object.assign to bypass readonly properties
      Object.assign(queryDto, { page: 2, pageSize: 5 });

      // Act
      await controller.findAll('123', queryDto);

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          page: 2,
          pageSize: 5
        })
      );
    });
  });

  describe('create', () => {
    it('should pass authenticated actorId to the command bus', async () => {
      commandBus.execute.mockResolvedValue(mockUserResponse);

      const result = await controller.create('123', '456', {
        isActive: true,
        isVerified: false
      });

      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          actorId: 456,
          organizationId: 123,
          isActive: true,
          isVerified: false
        })
      );
    });

    it('should throw when actorId is not numeric', async () => {
      await expect(controller.create('123', 'invalid', {})).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'actorId',
          expectedType: 'integer'
        })
      );

      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should pass authenticated actorId to the command bus', async () => {
      commandBus.execute.mockResolvedValue(mockUserResponse);

      const result = await controller.update('123', '456', 99, {
        isActive: false
      });

      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          actorId: 456,
          id: 99,
          isActive: false
        })
      );
    });

    it('should pin create organizationId to the tenant header', async () => {
      commandBus.execute.mockResolvedValue(mockUserResponse);

      await controller.create('123', '456', {
        isActive: true
      });

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          organizationId: 123
        })
      );
    });

    it('should not forward organizationId on update', async () => {
      commandBus.execute.mockResolvedValue(mockUserResponse);

      await controller.update('123', '456', 99, {
        isActive: false
      });

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.not.objectContaining({
          organizationId: expect.anything()
        })
      );
    });

    it('should throw when actorId is not numeric', async () => {
      await expect(controller.update('123', 'invalid', 99, {})).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'actorId',
          expectedType: 'integer'
        })
      );

      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should pass authenticated actorId to the command bus', async () => {
      commandBus.execute.mockResolvedValue(undefined);

      await controller.delete('123', '456', 99);

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          actorId: 456,
          id: 99
        })
      );
    });

    it('should throw when actorId is not numeric', async () => {
      await expect(controller.delete('123', 'invalid', 99)).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'actorId',
          expectedType: 'integer'
        })
      );

      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });
});
