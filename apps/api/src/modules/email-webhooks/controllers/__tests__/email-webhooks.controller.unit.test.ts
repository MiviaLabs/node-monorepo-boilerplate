import { BadRequestException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import { InboundMailController } from '../email-webhooks.controller';

import type { TestingModule } from '@nestjs/testing';

describe('InboundMailController', () => {
  let controller: InboundMailController;
  let commandBus: jest.Mocked<CommandBus>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboundMailController],
      providers: [
        {
          provide: CommandBus,
          useValue: {
            execute: jest.fn()
          }
        }
      ]
    }).compile();

    controller = module.get(InboundMailController);
    commandBus = module.get(CommandBus);
  });

  it('passes the captured raw body and trace fields to the command bus', async () => {
    commandBus.execute.mockResolvedValue({
      webhookEventId: 21,
      duplicate: false,
      processingStatus: 'persisted',
      verificationStatus: 'verified',
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered'
    });

    const rawBody = Buffer.from('{"type":"email.delivered"}', 'utf-8');

    await controller.ingestWebhook(
      'resend',
      {
        rawBody,
        headers: {
          'content-type': 'application/json'
        }
      } as never,
      { type: 'email.delivered' },
      {
        requestId: 'req-webhook-1',
        correlationId: 'corr-webhook-1',
        causationId: 'cause-webhook-1'
      }
    );

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'resend',
        rawBody,
        contentType: 'application/json',
        requestId: 'req-webhook-1',
        correlationId: 'corr-webhook-1',
        causationId: 'cause-webhook-1'
      })
    );
  });

  it('fails fast when raw body capture is unavailable', async () => {
    await expect(
      controller.ingestWebhook(
        'resend',
        {
          headers: {
            'content-type': 'application/json'
          }
        } as never,
        { type: 'email.delivered' }
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
