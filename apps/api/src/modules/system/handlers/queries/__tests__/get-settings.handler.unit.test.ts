import { Test } from '@nestjs/testing';

import { GetSettingsQuery } from '../../../queries/get-settings.query';
import { GetSettingsHandler } from '../get-settings.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetSettingsHandler', () => {
  let handler: GetSettingsHandler;
  let db: { select: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    const directTenantWhere = {
      limit: jest.fn().mockResolvedValue([
        {
          settings: {
            allowRegistration: false,
            maxTenantsPerUser: 5
          }
        }
      ])
    };
    const directTenantFrom = {
      where: jest.fn().mockReturnValue(directTenantWhere)
    };
    const joinedTenantWhere = {
      limit: jest.fn().mockResolvedValue([])
    };
    const joinedTenantJoin = {
      where: jest.fn().mockReturnValue(joinedTenantWhere)
    };
    const joinedTenantFrom = {
      innerJoin: jest.fn().mockReturnValue(joinedTenantJoin)
    };

    db = {
      select: jest
        .fn()
        .mockReturnValueOnce({ from: jest.fn().mockReturnValue(directTenantFrom) })
        .mockReturnValueOnce({ from: jest.fn().mockReturnValue(joinedTenantFrom) })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetSettingsHandler,
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<GetSettingsHandler>(GetSettingsHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('merges persisted tenant settings with stable defaults', async () => {
    const result = await handler.execute(new GetSettingsQuery({ tenantId: 1 }));

    expect(result).toEqual({
      allowRegistration: false,
      requireEmailVerification: true,
      defaultUserRole: 'tenant_user',
      maxTenantsPerUser: 5,
      sessionTimeout: 3600,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false
      }
    });
  });

  it('falls back to organization -> tenant resolution when direct tenant lookup misses', async () => {
    const directTenantWhere = {
      limit: jest.fn().mockResolvedValue([])
    };
    const directTenantFrom = {
      where: jest.fn().mockReturnValue(directTenantWhere)
    };
    const joinedTenantWhere = {
      limit: jest.fn().mockResolvedValue([
        {
          settings: {
            sessionTimeout: 7200
          }
        }
      ])
    };
    const joinedTenantJoin = {
      where: jest.fn().mockReturnValue(joinedTenantWhere)
    };
    const joinedTenantFrom = {
      innerJoin: jest.fn().mockReturnValue(joinedTenantJoin)
    };

    db.select = jest
      .fn()
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(directTenantFrom) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(joinedTenantFrom) });

    const result = await handler.execute(new GetSettingsQuery({ tenantId: 99 }));

    expect(result.sessionTimeout).toBe(7200);
    expect(result.allowRegistration).toBe(true);
  });

  it('audits the settings read without recording raw setting values', async () => {
    const query = new GetSettingsQuery({
      tenantId: 1,
      actorId: 'actor-11',
      requestId: 'req-11',
      correlationId: 'corr-11',
      causationId: 'cause-11'
    });

    await handler.execute(query);

    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'system.settings.viewed.audit',
        payload: expect.objectContaining({
          details: expect.objectContaining({
            settingKeys: expect.arrayContaining(['allowRegistration', 'passwordPolicy'])
          })
        })
      })
    );

    const payload = auditOutbox.insert.mock.calls[0]?.[1]?.payload as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toContain('tenant_user');
    expect(JSON.stringify(payload)).not.toContain('3600');
  });
});
