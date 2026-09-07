import { BadRequestException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import { CredentialRecoveryController } from '../password-reset.controller';

import type { TestingModule } from '@nestjs/testing';

describe('CredentialRecoveryController', () => {
  let controller: CredentialRecoveryController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CredentialRecoveryController],
      providers: [
        {
          provide: CommandBus,
          useValue: {
            execute: jest.fn()
          }
        },
        {
          provide: QueryBus,
          useValue: {
            execute: jest.fn()
          }
        }
      ]
    }).compile();

    controller = module.get(CredentialRecoveryController);
    commandBus = module.get(CommandBus);
    queryBus = module.get(QueryBus);
  });

  it('passes request trace to request-password-reset commands', async () => {
    commandBus.execute.mockResolvedValue({
      success: true,
      message: 'If the email exists, a reset link has been sent'
    });

    await controller.requestPasswordReset(
      { email: 'user@example.com' },
      {
        requestId: 'req-pr-1',
        correlationId: 'corr-pr-1',
        causationId: 'cause-pr-1'
      }
    );

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        requestId: 'req-pr-1',
        correlationId: 'corr-pr-1',
        causationId: 'cause-pr-1'
      })
    );
  });

  it('passes request trace to reset-password commands', async () => {
    commandBus.execute.mockResolvedValue({
      success: true,
      message: 'Password reset successfully'
    });

    await controller.resetPassword(
      {
        token: 'reset-token',
        newPassword: 'Password123!',
        confirmPassword: 'Password123!'
      },
      {
        requestId: 'req-pr-2',
        correlationId: 'corr-pr-2',
        causationId: 'cause-pr-2'
      }
    );

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'reset-token',
        newPassword: 'Password123!',
        requestId: 'req-pr-2',
        correlationId: 'corr-pr-2',
        causationId: 'cause-pr-2'
      })
    );
  });

  it('passes request trace to validate-password-reset-token queries', async () => {
    queryBus.execute.mockResolvedValue({
      isValid: true,
      status: 'valid'
    });

    await controller.validateToken('reset-token', {
      requestId: 'req-pr-3',
      correlationId: 'corr-pr-3',
      causationId: 'cause-pr-3'
    });

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'reset-token',
        requestId: 'req-pr-3',
        correlationId: 'corr-pr-3',
        causationId: 'cause-pr-3'
      })
    );
  });

  it('throws for missing validation token', async () => {
    await expect(controller.validateToken('')).rejects.toBeInstanceOf(BadRequestException);
  });
});
