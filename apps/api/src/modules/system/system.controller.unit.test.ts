import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import { PlatformController } from './system.controller';

import type { TestingModule } from '@nestjs/testing';

describe('PlatformController', () => {
  let controller: PlatformController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  const trace = {
    requestId: 'req-system-1',
    correlationId: 'corr-system-1',
    causationId: 'cause-system-1'
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformController],
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

    controller = module.get(PlatformController);
    commandBus = module.get(CommandBus);
    queryBus = module.get(QueryBus);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passes trace metadata into listTenants queries', async () => {
    queryBus.execute.mockResolvedValue([]);

    await controller.listTenants('actor-1', trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        requestId: 'req-system-1',
        correlationId: 'corr-system-1',
        causationId: 'cause-system-1'
      })
    );
  });

  it('passes trace metadata into getSystemMetrics queries', async () => {
    queryBus.execute.mockResolvedValue({
      timestamp: new Date().toISOString(),
      uptime: 1,
      memory: process.memoryUsage(),
      tenants: { total: 0, active: 0, suspended: 0 },
      users: { total: 0, active: 0, inactive: 0 },
      requests: { total: 0, perMinute: 0 }
    });

    await controller.getSystemMetrics('actor-2', trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2',
        requestId: 'req-system-1',
        correlationId: 'corr-system-1',
        causationId: 'cause-system-1'
      })
    );
  });

  it('passes trace metadata into getSystemSettings queries', async () => {
    queryBus.execute.mockResolvedValue({
      allowRegistration: true,
      requireEmailVerification: true,
      defaultUserRole: 'tenant_user',
      maxTenantsPerUser: 1,
      sessionTimeout: 3600,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false
      }
    });

    await controller.getSystemSettings('42', 'actor-3', trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 42,
        actorId: 'actor-3',
        requestId: 'req-system-1',
        correlationId: 'corr-system-1',
        causationId: 'cause-system-1'
      })
    );
  });

  it('passes requestId, correlationId, and causationId into updateSystemSettings commands', async () => {
    commandBus.execute.mockResolvedValue({
      allowRegistration: false,
      requireEmailVerification: true,
      defaultUserRole: 'tenant_user',
      maxTenantsPerUser: 1,
      sessionTimeout: 3600,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false
      }
    });

    await controller.updateSystemSettings('42', 'actor-4', { allowRegistration: false }, trace);

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 42,
        actorId: 'actor-4',
        requestId: 'req-system-1',
        correlationId: 'corr-system-1',
        causationId: 'cause-system-1'
      })
    );
  });
});
