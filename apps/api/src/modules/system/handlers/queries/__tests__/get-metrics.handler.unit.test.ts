import { Test } from '@nestjs/testing';

import { GetMetricsQuery } from '../../../queries/get-metrics.query';
import { GetMetricsHandler } from '../get-metrics.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetMetricsHandler', () => {
  let handler: GetMetricsHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;

  beforeEach(async () => {
    db = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            tenants_total: 4,
            tenants_active: 2,
            tenants_suspended: 1,
            users_total: 8,
            users_active: 6,
            users_inactive: 2
          }
        ]
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetMetricsHandler,
        {
          provide: AuditOutboxPublisher,
          useValue: {
            insert: jest.fn()
          }
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<GetMetricsHandler>(GetMetricsHandler);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return SystemMetricsDto with all required fields', async () => {
      const query = new GetMetricsQuery({ tenantId: 1 });

      const result = await handler.execute(query);

      expect(result).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(result.uptime).toBeDefined();
      expect(typeof result.uptime).toBe('number');
      expect(result.memory).toBeDefined();
      expect(result.tenants).toBeDefined();
      expect(result.users).toBeDefined();
      expect(result.requests).toBeDefined();
    });

    it('should use live database-backed tenant and user counts', async () => {
      const query = new GetMetricsQuery({ tenantId: 1 });
      const result = await handler.execute(query);

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(result.tenants).toEqual({
        total: 4,
        active: 2,
        suspended: 1
      });
      expect(result.users).toEqual({
        total: 8,
        active: 6,
        inactive: 2
      });
    });

    it('should return request statistics as explicit runtime defaults when no persisted counter exists', async () => {
      const query = new GetMetricsQuery({ tenantId: 1 });
      const result = await handler.execute(query);

      expect(result.requests).toEqual({
        total: 0,
        perMinute: 0
      });
    });

    it('should return uptime and memory from the running process', async () => {
      const query = new GetMetricsQuery({ tenantId: 1 });
      const result = await handler.execute(query);

      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.memory).toHaveProperty('rss');
      expect(result.memory).toHaveProperty('heapUsed');
    });

    it('should default counts to zero when the database query returns no row', async () => {
      db.execute.mockResolvedValueOnce({ rows: [] });

      const result = await handler.execute(new GetMetricsQuery({ tenantId: 1 }));

      expect(result.tenants).toEqual({
        total: 0,
        active: 0,
        suspended: 0
      });
      expect(result.users).toEqual({
        total: 0,
        active: 0,
        inactive: 0
      });
    });

    it('audits the metrics read with propagated trace metadata', async () => {
      const query = new GetMetricsQuery({
        tenantId: 1,
        actorId: 'actor-12',
        requestId: 'req-12',
        correlationId: 'corr-12',
        causationId: 'cause-12'
      });

      await handler.execute(query);

      expect(auditOutbox.insert).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          eventType: 'system.metrics.viewed.audit',
          correlationId: 'corr-12',
          causationId: 'cause-12',
          payload: expect.objectContaining({
            requestId: 'req-12',
            actorId: 'actor-12'
          })
        })
      );
    });

    it('skips audit emission when a higher-level audited read reuses metrics as an internal helper', async () => {
      const query = new GetMetricsQuery({
        tenantId: 1,
        actorId: 'actor-13',
        requestId: 'req-13',
        correlationId: 'corr-13',
        causationId: 'cause-13',
        emitAuditEvent: false
      });

      await handler.execute(query);

      expect(auditOutbox.insert).not.toHaveBeenCalled();
    });
  });
});
