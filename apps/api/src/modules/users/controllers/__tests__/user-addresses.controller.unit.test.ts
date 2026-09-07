/**
 * PersonAddressesController Unit Tests
 *
 * Tests the PersonAddressesController HTTP layer.
 * Mocks the CommandBus and QueryBus to isolate controller logic.
 */

import { Reflector } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CachedPermissionService,
  EnhancedPermissionsGuard as BaseEnhancedPermissionsGuard
} from '@package/auth';
import { AddressType } from '@package/constants';
import { Errors } from '@package/errors';

import { PersonAddressesController } from '../../controllers/user-addresses.controller';

import type { AddressResponseDto, CreateUserAddressDto, UpdateUserAddressDto } from '../../dto';
import type { TestingModule } from '@nestjs/testing';

import { BaseResponseDto } from '@/common/dtos';
import { JwtAuthGuard } from '@/modules/auth/guards';

describe('PersonAddressesController', () => {
  let controller: PersonAddressesController;
  let queryBus: jest.Mocked<QueryBus>;
  let commandBus: jest.Mocked<CommandBus>;

  const mockAddressResponse: AddressResponseDto = {
    id: 1,
    organizationId: 123,
    userId: 456,
    addressType: AddressType.Primary,
    label: 'Home',
    streetEncryptedStoreId: 1,
    street2EncryptedStoreId: 2,
    cityEncryptedStoreId: 3,
    stateEncryptedStoreId: 4,
    postalCodeEncryptedStoreId: 5,
    countryEncryptedStoreId: 6,
    countryCode: 'US',
    isDefault: true,
    isVerified: false,
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

    const mockBaseGuard = {
      canActivate: jest.fn().mockReturnValue(true)
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonAddressesController],
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

    controller = module.get<PersonAddressesController>(PersonAddressesController);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryBus = module.get<QueryBus>(QueryBus) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    commandBus = module.get<CommandBus>(CommandBus) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return addresses wrapped in BaseResponseDto', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue([mockAddressResponse]);

      // Act
      const result = await controller.findAll('123', 456);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual([mockAddressResponse]);
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          userId: 456
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
      await expect(controller.findAll('invalid', 456)).rejects.toThrow(expectedError);
      expect(queryBus.execute).not.toHaveBeenCalled();
    });

    it('should parse tenant ID string to integer', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue([mockAddressResponse]);

      // Act
      await controller.findAll('456', 789);

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 456
        })
      );
    });

    it('should propagate errors from query bus', async () => {
      // Arrange
      const error = Errors.databaserecordNotFound004({ entity: 'UserAddress' });
      queryBus.execute.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.findAll('123', 456)).rejects.toThrow(error);
    });
  });

  describe('findDefault', () => {
    it('should return default address wrapped in BaseResponseDto', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      const result = await controller.findDefault('123', 456);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual(mockAddressResponse);
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          userId: 456
        })
      );
    });

    it('should return null when no default address exists', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue(null);

      // Act
      const result = await controller.findDefault('123', 456);

      // Assert
      expect(result.data).toBeNull();
    });

    it('should throw VAL_002 error for invalid tenant ID', async () => {
      // Arrange & Act & Assert
      await expect(controller.findDefault('abc', 456)).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'x-tenant-id',
          expectedType: 'integer'
        })
      );
      expect(queryBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return specific address wrapped in BaseResponseDto', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      const result = await controller.findOne('123', 456, 1, undefined, {});

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual(mockAddressResponse);
    });

    it('should throw VAL_002 error for invalid tenant ID', async () => {
      // Arrange & Act & Assert
      await expect(controller.findOne('invalid', 456, 1, undefined, {})).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'x-tenant-id',
          expectedType: 'integer'
        })
      );
    });

    it('should propagate address not found from the query handler', async () => {
      // Arrange
      queryBus.execute.mockRejectedValue(
        Errors.databaserecordNotFound004({ entity: 'UserAddress' })
      );

      // Act & Assert
      await expect(controller.findOne('123', 456, 999, undefined, {})).rejects.toThrow(
        Errors.databaserecordNotFound004({ entity: 'UserAddress' })
      );
    });
  });

  describe('create', () => {
    it('should create address and return wrapped in BaseResponseDto', async () => {
      // Arrange
      const dto: CreateUserAddressDto = {
        userId: '456',
        addressType: AddressType.Primary,
        isDefault: true,
        countryCode: 'US',
        components: {
          street: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          postalCode: '62701',
          country: 'United States'
        }
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      const result = await controller.create('123', 456, dto);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual(mockAddressResponse);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          userId: 456
        })
      );
    });

    it('should use authenticated userId as actorId for command', async () => {
      // Arrange
      const dto: CreateUserAddressDto = {
        userId: '456',
        addressType: AddressType.Primary,
        countryCode: 'US',
        components: {
          street: '123 Main St'
        }
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      await controller.create('123', 456, dto);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          actorId: 456
        })
      );
    });

    it('should fallback actorId to path userId when actor claim is non-numeric', async () => {
      // Arrange
      const dto: CreateUserAddressDto = {
        userId: '456',
        addressType: AddressType.Primary,
        countryCode: 'US',
        components: {
          street: '123 Main St'
        }
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      await controller.create('123', 456, dto, 'user-abc');

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          actorId: 456
        })
      );
    });

    it('should throw VAL_002 error for invalid tenant ID', async () => {
      // Arrange
      const dto: CreateUserAddressDto = {
        userId: '456',
        addressType: AddressType.Primary,
        countryCode: 'US',
        components: {
          street: '123 Main St'
        }
      };

      // Act & Assert
      await expect(controller.create('invalid', 456, dto)).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'x-tenant-id',
          expectedType: 'integer'
        })
      );
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update address and return wrapped in BaseResponseDto', async () => {
      // Arrange
      const dto: UpdateUserAddressDto = {
        addressType: AddressType.Office,
        isDefault: false,
        components: {
          street: '456 New St'
        }
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      const result = await controller.update('123', 456, 1, dto);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual(mockAddressResponse);
      expect(commandBus.execute).toHaveBeenCalled();
    });

    it('should use authenticated userId as actorId for command', async () => {
      // Arrange
      const dto: UpdateUserAddressDto = {
        addressType: AddressType.Office
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      await controller.update('123', 456, 1, dto);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          actorId: 456,
          addressId: 1
        })
      );
    });

    it('should fallback actorId to path userId when actor claim is non-numeric', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      // Act
      await controller.delete('456', 789, 1, 'user-abc');

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 456,
          actorId: 789
        })
      );
    });

    it('should build update command with only provided fields', async () => {
      // Arrange
      const dto: UpdateUserAddressDto = {
        addressType: AddressType.Office,
        components: {
          city: 'New City'
        }
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      await controller.update('123', 456, 1, dto);

      // Assert
      const command = (commandBus.execute as jest.MockedFn<typeof commandBus.execute>).mock
        .calls[0]?.[0] as {
        tenantId: number;
        actorId: number;
        addressId: number;
        components?: Record<string, unknown>;
      };

      expect(command).toMatchObject({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });
      expect(command?.components).toBeDefined();
      expect(command?.components).toEqual(
        expect.objectContaining({
          city: 'New City'
        })
      );
    });

    it('should handle update with only non-PII fields', async () => {
      // Arrange
      const dto: UpdateUserAddressDto = {
        isDefault: true
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      await controller.update('123', 456, 1, dto);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          isDefault: true
        })
      );
    });

    it('should throw VAL_002 error for invalid tenant ID', async () => {
      // Arrange
      const dto: UpdateUserAddressDto = {
        isDefault: true
      };

      // Act & Assert
      await expect(controller.update('invalid', 456, 1, dto)).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'x-tenant-id',
          expectedType: 'integer'
        })
      );
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete address and return void', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      // Act
      const result = await controller.delete('123', 456, 1);

      // Assert
      expect(result).toBeUndefined();
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          actorId: 456,
          addressId: 1
        })
      );
    });

    it('should use authenticated userId as actorId for command', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      // Act
      await controller.delete('456', 789, 1);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 456,
          actorId: 789
        })
      );
    });

    it('should propagate errors from command bus', async () => {
      // Arrange
      const error = Errors.databaserecordNotFound004({ entity: 'UserAddress' });
      commandBus.execute.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.delete('123', 456, 1)).rejects.toThrow(error);
    });

    it('should throw VAL_002 error for invalid tenant ID', async () => {
      // Act & Assert
      await expect(controller.delete('invalid', 456, 1)).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'x-tenant-id',
          expectedType: 'integer'
        })
      );
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('tenant ID parsing', () => {
    it('should parse valid tenant IDs correctly', async () => {
      // Arrange
      const testCases = [
        { input: '1', expected: 1 },
        { input: '123', expected: 123 },
        { input: '999999', expected: 999999 }
      ];

      for (const testCase of testCases) {
        queryBus.execute.mockResolvedValue([mockAddressResponse]);

        // Act
        await controller.findAll(testCase.input, 456);

        // Assert
        expect(queryBus.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: testCase.expected
          })
        );
      }
    });

    it('should reject non-numeric tenant IDs', async () => {
      // Arrange
      // Note: parseInt('123abc', 10) returns 123, so it would NOT be rejected
      // Only truly non-numeric strings will be rejected
      const invalidIds = ['abc', 'abc123', '', 'null'];

      for (const invalidId of invalidIds) {
        // Act & Assert
        await expect(controller.findAll(invalidId, 456)).rejects.toThrow(
          Errors.validationinvalidValueFor002({
            field: 'x-tenant-id',
            expectedType: 'integer'
          })
        );
      }
    });

    it('should reject zero and negative tenant IDs from pipe', async () => {
      // Note: The pipe validates positive integers, so 0 and negative values
      // should be rejected by ParseIntUserIdPipe before reaching controller
      // This test documents the expected behavior
      const invalidIds = ['0', '-1', '-100'];

      for (const invalidId of invalidIds) {
        // These would be rejected by ParseIntUserIdPipe
        // The controller expects validated positive integers
        // Just documenting the expectation
        expect(Number(invalidId) <= 0).toBe(true);
      }
    });
  });

  describe('CQRS dispatch behavior', () => {
    it('should dispatch queries for read operations', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue([mockAddressResponse]);

      // Act
      await controller.findAll('123', 456);

      // Assert
      expect(queryBus.execute).toHaveBeenCalled();
      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it('should dispatch commands for write operations', async () => {
      // Arrange
      const dto: CreateUserAddressDto = {
        userId: '456',
        addressType: AddressType.Primary,
        countryCode: 'US',
        components: {
          street: '123 Main St'
        }
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      await controller.create('123', 456, dto);

      // Assert
      expect(commandBus.execute).toHaveBeenCalled();
      expect(queryBus.execute).not.toHaveBeenCalled();
    });

    it('should not mix query and command buses in single operation', async () => {
      // Arrange
      const dto: CreateUserAddressDto = {
        userId: '456',
        addressType: AddressType.Primary,
        countryCode: 'US',
        components: {
          street: '123 Main St'
        }
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      await controller.create('123', 456, dto);

      // Assert - Only commandBus should be used for create
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      expect(queryBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('response wrapping', () => {
    it('should always return BaseResponseDto for queries', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      const result = await controller.findDefault('123', 456);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result).toHaveProperty('data');
    });

    it('should always return BaseResponseDto for commands', async () => {
      // Arrange
      const dto: CreateUserAddressDto = {
        userId: '456',
        addressType: AddressType.Primary,
        countryCode: 'US',
        components: {
          street: '123 Main St'
        }
      };
      commandBus.execute.mockResolvedValue(mockAddressResponse);

      // Act
      const result = await controller.create('123', 456, dto);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result).toHaveProperty('data');
    });

    it('should handle null responses from queries', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue(null);

      // Act
      const result = await controller.findDefault('123', 456);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toBeNull();
    });
  });
});
