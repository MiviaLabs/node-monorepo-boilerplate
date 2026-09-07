import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { DeadLetterService } from '@package/events';

import { GetAdminHealthOverviewHandler } from '../get-admin-health-overview.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { DatabaseHealthIndicator } from '@/modules/health/indicators/database-health-indicator';
import { EncryptionHealthIndicator } from '@/modules/health/indicators/encryption-health-indicator';
import { OutboxHealthIndicator } from '@/modules/health/indicators/outbox-health-indicator';
import { RedisHealthIndicator } from '@/modules/health/indicators/redis-health-indicator';

describe('GetAdminHealthOverviewHandler', () => {
  let handler: GetAdminHealthOverviewHandler;
  let queryBus: { execute: jest.Mock };
  let databaseHealthIndicator: { check: jest.Mock };
  let redisHealthIndicator: { check: jest.Mock };
  let encryptionHealthIndicator: { check: jest.Mock };
  let outboxHealthIndicator: { check: jest.Mock };
  let deadLetterService: { getDeadLetteredEvents: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    queryBus = {
      execute: jest.fn().mockResolvedValue({
        timestamp: '2026-03-13T12:00:00.000Z',
        uptime: 100,
        memory: process.memoryUsage(),
        tenants: {
          total: 3,
          active: 2,
          suspended: 1
        },
        users: {
          total: 9,
          active: 7,
          inactive: 2
        },
        requests: {
          total: 0,
          perMinute: 0
        }
      })
    };

    databaseHealthIndicator = {
      check: jest.fn().mockResolvedValue({ status: 'up' })
    };
    redisHealthIndicator = {
      check: jest.fn().mockResolvedValue({ status: 'up' })
    };
    encryptionHealthIndicator = {
      check: jest.fn().mockResolvedValue({ status: 'up' })
    };
    outboxHealthIndicator = {
      check: jest.fn().mockResolvedValue({
        status: 'degraded',
        message: '3 failed events',
        details: {
          pendingCount: 11,
          failedCount: 3,
          isProcessing: true,
          eventsEnabled: true
        }
      })
    };

    deadLetterService = {
      getDeadLetteredEvents: jest.fn().mockResolvedValue([
        {
          eventId: 'evt-dead-letter-1',
          eventType: 'notification.delivery.failed',
          deadLetteredAt: new Date('2026-03-13T11:55:00.000Z')
        }
      ])
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminHealthOverviewHandler,
        {
          provide: QueryBus,
          useValue: queryBus
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: databaseHealthIndicator
        },
        {
          provide: RedisHealthIndicator,
          useValue: redisHealthIndicator
        },
        {
          provide: EncryptionHealthIndicator,
          useValue: encryptionHealthIndicator
        },
        {
          provide: OutboxHealthIndicator,
          useValue: outboxHealthIndicator
        },
        {
          provide: DeadLetterService,
          useValue: deadLetterService
        },
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: {}
        }
      ]
    }).compile();

    handler = module.get<GetAdminHealthOverviewHandler>(GetAdminHealthOverviewHandler);
  });

  it('composes health indicators, metrics, and dead-letter signals into the admin contract', async () => {
    const result = await handler.execute({
      tenantId: 0,
      actorId: 'actor-health-1',
      requestId: 'req-health-1',
      correlationId: 'corr-health-1',
      causationId: 'cause-health-1'
    } as never);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 0,
        actorId: 'actor-health-1',
        requestId: 'req-health-1',
        correlationId: 'corr-health-1',
        causationId: 'cause-health-1',
        emitAuditEvent: false
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'admin.health.viewed.audit',
        correlationId: 'corr-health-1',
        causationId: 'cause-health-1',
        payload: expect.objectContaining({
          requestId: 'req-health-1',
          actorId: 'actor-health-1',
          details: expect.objectContaining({
            includesHealthIndicators: true,
            includesDeadLetterSummary: true
          })
        })
      })
    );
    expect(JSON.stringify(auditOutbox.insert.mock.calls[0]?.[1]?.payload)).not.toContain(
      'notification.delivery.failed'
    );
    expect(result.generatedAt).toBe('2026-03-13T12:00:00.000Z');
    expect(result.overallStatus).toBe('degraded');
    expect(result.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'database', status: 'ok' }),
        expect.objectContaining({ key: 'outbox', status: 'degraded' })
      ])
    );
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'tenants_total', value: 3 }),
        expect.objectContaining({ key: 'users_total', value: 9 }),
        expect.objectContaining({ key: 'outbox_pending', value: 11 }),
        expect.objectContaining({ key: 'dead_letter_total', value: 1 })
      ])
    );
    expect(result.incidents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dead-letter-open',
          kind: 'dead_letter_events',
          priority: 'high'
        }),
        expect.objectContaining({
          id: 'outbox-failures',
          kind: 'outbox_failures',
          priority: 'high'
        })
      ])
    );
  });

  it('returns an ok overview when there are no failures or incidents', async () => {
    outboxHealthIndicator.check.mockResolvedValueOnce({
      status: 'up',
      details: {
        pendingCount: 0,
        failedCount: 0,
        isProcessing: false,
        eventsEnabled: true
      }
    });
    databaseHealthIndicator.check.mockResolvedValueOnce({ status: 'up' });
    redisHealthIndicator.check.mockResolvedValueOnce({ status: 'up' });
    encryptionHealthIndicator.check.mockResolvedValueOnce({ status: 'up' });
    queryBus.execute.mockResolvedValueOnce({
      timestamp: '2026-03-13T12:00:00.000Z',
      uptime: 100,
      memory: process.memoryUsage(),
      tenants: {
        total: 3,
        active: 2,
        suspended: 1
      },
      users: {
        total: 9,
        active: 7,
        inactive: 2
      },
      requests: {
        total: 0,
        perMinute: 0
      }
    });
    deadLetterService.getDeadLetteredEvents.mockResolvedValueOnce([]);

    const result = await handler.execute({ tenantId: 0 } as never);

    expect(result.overallStatus).toBe('ok');
    expect(result.incidents).toEqual([]);
  });
});
