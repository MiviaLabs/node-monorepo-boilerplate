import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import { InboundMailOpsController } from '../email-webhook-operations.controller';

import { MAIN_DB } from '@/common/database/database.constants';
import { BaseResponseDto } from '@/common/dtos';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

describe('InboundMailOpsController', () => {
  it('returns webhook summary and audits the read', async () => {
    const queryBus = {
      execute: jest.fn().mockResolvedValue({
        generatedAt: '2026-03-17T10:00:00.000Z',
        totalEvents: 10,
        appliedEvents: 7,
        unmatchedEvents: 2,
        failedEvents: 1,
        pendingEvents: 0,
        retryableEvents: 4
      })
    };
    const auditOutbox = {
      insert: jest.fn()
    };

    const module = await Test.createTestingModule({
      controllers: [InboundMailOpsController],
      providers: [
        { provide: QueryBus, useValue: queryBus },
        { provide: CommandBus, useValue: { execute: jest.fn() } },
        { provide: AuditOutboxPublisher, useValue: auditOutbox },
        { provide: MAIN_DB, useValue: {} }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HybridPolicyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = module.get(InboundMailOpsController);
    const result = await controller.getSummary('actor-1');

    expect(result).toBeInstanceOf(BaseResponseDto);
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        eventType: 'system.email.webhooks.summary.viewed.audit'
      })
    );
  });

  it('lists webhook events and audits the read', async () => {
    const queryBus = {
      execute: jest.fn().mockResolvedValue({
        page: 1,
        pageSize: 20,
        total: 1,
        items: []
      })
    };
    const auditOutbox = {
      insert: jest.fn()
    };

    const module = await Test.createTestingModule({
      controllers: [InboundMailOpsController],
      providers: [
        { provide: QueryBus, useValue: queryBus },
        { provide: CommandBus, useValue: { execute: jest.fn() } },
        { provide: AuditOutboxPublisher, useValue: auditOutbox },
        { provide: MAIN_DB, useValue: {} }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HybridPolicyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = module.get(InboundMailOpsController);
    await controller.listEvents(
      'actor-1',
      {
        provider: 'resend',
        organizationId: 44,
        processingStatus: 'failed',
        verificationStatus: 'verified',
        normalizedEventType: 'delivered',
        providerEventType: 'email.delivered',
        providerMessageId: 'msg-1',
        providerDeliveryId: 'delivery-1',
        providerEventId: 'evt-1',
        emailMessageId: 77,
        dateFrom: '2026-03-01T00:00:00.000Z',
        dateTo: '2026-03-31T23:59:59.999Z'
      },
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      }
    );

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        tenantId: 0,
        provider: 'resend',
        organizationId: 44,
        page: 1,
        pageSize: 20,
        readonly: true,
        processingStatus: 'failed',
        verificationStatus: 'verified',
        normalizedEventType: 'delivered',
        providerEventType: 'email.delivered',
        providerMessageId: 'msg-1',
        providerDeliveryId: 'delivery-1',
        providerEventId: 'evt-1',
        emailMessageId: 77,
        dateFrom: '2026-03-01T00:00:00.000Z',
        dateTo: '2026-03-31T23:59:59.999Z',
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        eventType: 'system.email.webhooks.listed.audit'
      })
    );
    const [, auditEvent] = auditOutbox.insert.mock.calls[0] ?? [];
    expect(auditEvent?.payload?.details).toEqual(
      expect.objectContaining({
        organizationId: 44,
        verificationStatus: 'verified',
        normalizedEventType: 'delivered',
        providerEventType: 'email.delivered',
        providerMessageId: 'msg-1',
        providerDeliveryId: 'delivery-1',
        providerEventId: 'evt-1'
      })
    );
  });

  it('reprocesses a webhook event through the command bus and audits it', async () => {
    const commandBus = {
      execute: jest.fn().mockResolvedValue({
        webhookEventId: 44,
        processingStatus: 'applied',
        attemptCount: 2,
        reprocessed: true
      })
    };
    const module = await Test.createTestingModule({
      controllers: [InboundMailOpsController],
      providers: [
        { provide: QueryBus, useValue: { execute: jest.fn() } },
        { provide: CommandBus, useValue: commandBus },
        { provide: AuditOutboxPublisher, useValue: { insert: jest.fn() } },
        { provide: MAIN_DB, useValue: {} }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HybridPolicyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = module.get(InboundMailOpsController);
    const result = await controller.reprocessEvent('actor-2', 44, {
      requestId: 'req-44',
      correlationId: 'corr-44',
      causationId: 'cause-44'
    });

    expect(result.data).toEqual({
      webhookEventId: 44,
      processingStatus: 'applied',
      attemptCount: 2,
      reprocessed: true
    });
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookEventId: 44
      })
    );
  });
});
