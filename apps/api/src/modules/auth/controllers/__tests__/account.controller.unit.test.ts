/**
 * Unit Tests for GdprAccountController
 *
 * Tests account management endpoints: deleteAccount, exportUserData, transferOwnership.
 */

import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import { CanDeleteUserGuard } from '../../guards/can-delete-user.guard';
import { GdprAccountController } from '../account.controller';

import type { DeleteAccountCommand } from '../../commands/delete-account.command';
import type { TransferOwnershipCommand } from '../../commands/transfer-ownership.command';
import type { TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

describe('GdprAccountController', () => {
  let controller: GdprAccountController;
  let commandBus: jest.Mocked<CommandBus>;

  const mockExportData = {
    user: {
      id: '456',
      email: 'test@example.com',
      displayName: 'Test User',
      isVerified: true,
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-15T00:00:00.000Z',
      lastSignInAt: '2024-01-20T00:00:00.000Z'
    },
    identities: [
      {
        provider: 'google',
        displayName: 'Test Google',
        emailVerified: true,
        createdAt: '2024-01-01T00:00:00.000Z'
      }
    ],
    organization: {
      id: '123',
      name: 'Test Org'
    },
    exportedAt: '2024-01-25T00:00:00.000Z',
    exportedBy: '456'
  };

  beforeEach(async () => {
    const mockCommandBus = {
      execute: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GdprAccountController],
      providers: [
        {
          provide: CommandBus,
          useValue: mockCommandBus
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CanDeleteUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GdprAccountController>(GdprAccountController);
    commandBus = module.get(CommandBus);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deleteAccount', () => {
    it('should execute DeleteAccountCommand', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      // Act
      await controller.deleteAccount('primary-encryption-key', 'actor-456', 'target-456');

      // Assert
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          actorId: 'actor-456',
          targetUserId: 'target-456'
        })
      );
    });

    it('should include reason when provided', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      // Act
      await controller.deleteAccount('primary-encryption-key', 'actor-456', 'target-456', 'gdpr');

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'gdpr'
        })
      );
    });

    it('should not include reason when undefined', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      // Act
      await controller.deleteAccount(
        'primary-encryption-key',
        'actor-456',
        'target-456',
        undefined
      );

      // Assert
      const command = (commandBus.execute as jest.Mock).mock.calls[0]?.[0] as DeleteAccountCommand;
      expect(command.reason).toBeUndefined();
    });

    it('should return void on success', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      // Act
      const result = await controller.deleteAccount(
        'primary-encryption-key',
        'actor-456',
        'target-456'
      );

      // Assert
      expect(result).toBeUndefined();
    });

    it('should propagate command bus errors', async () => {
      // Arrange
      commandBus.execute.mockRejectedValue(new Error('Delete failed'));

      // Act & Assert
      await expect(
        controller.deleteAccount('primary-encryption-key', 'actor-456', 'target-456')
      ).rejects.toThrow('Delete failed');
    });
  });

  describe('exportUserData', () => {
    it('should execute ExportUserDataCommand', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockExportData);

      // Act
      await controller.exportUserData('primary-encryption-key', 'actor-456', 'user-456');

      // Assert
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          actorId: 'actor-456'
        })
      );
    });

    it('should return BaseResponseDto with export data', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockExportData);

      // Act
      const result = await controller.exportUserData(
        'primary-encryption-key',
        'actor-456',
        'user-456'
      );

      // Assert
      expect(result.data).toEqual(mockExportData);
    });

    it('should include timestamp metadata', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockExportData);

      // Act
      const result = await controller.exportUserData(
        'primary-encryption-key',
        'actor-456',
        'user-456'
      );

      // Assert
      expect(result.metadata?.['timestamp']).toBeDefined();
    });

    it('should propagate command bus errors', async () => {
      // Arrange
      commandBus.execute.mockRejectedValue(new Error('Export failed'));

      // Act & Assert
      await expect(
        controller.exportUserData('primary-encryption-key', 'actor-456', 'user-456')
      ).rejects.toThrow('Export failed');
    });
  });

  describe('transferOwnership', () => {
    it('should execute TransferOwnershipCommand', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      const dto = { newOwnerId: 'new-owner-200' };

      // Act
      await controller.transferOwnership('primary-encryption-key', 'actor-100', dto);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          actorId: 'actor-100',
          newOwnerId: 'new-owner-200'
        })
      );
    });

    it('should include reason when provided', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      const dto = { newOwnerId: 'new-owner-200', reason: 'CEO transition' };

      // Act
      await controller.transferOwnership('primary-encryption-key', 'actor-100', dto);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'CEO transition'
        })
      );
    });

    it('should not include reason when undefined', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      const dto = { newOwnerId: 'new-owner-200' };

      // Act
      await controller.transferOwnership('primary-encryption-key', 'actor-100', dto);

      // Assert
      const command = (commandBus.execute as jest.Mock).mock
        .calls[0]?.[0] as TransferOwnershipCommand;
      expect(command.reason).toBeUndefined();
    });

    it('should return void on success', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      const dto = { newOwnerId: 'new-owner-200' };

      // Act
      const result = await controller.transferOwnership('primary-encryption-key', 'actor-100', dto);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should propagate command bus errors', async () => {
      // Arrange
      commandBus.execute.mockRejectedValue(new Error('Transfer failed'));

      const dto = { newOwnerId: 'new-owner-200' };

      // Act & Assert
      await expect(
        controller.transferOwnership('primary-encryption-key', 'actor-100', dto)
      ).rejects.toThrow('Transfer failed');
    });
  });
});
