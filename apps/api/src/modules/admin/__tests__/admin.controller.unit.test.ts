import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import { ConsoleController } from '../admin.controller';

import type { TestingModule } from '@nestjs/testing';

import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

describe('ConsoleController', () => {
  let controller: ConsoleController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  const trace = {
    requestId: 'req-admin-1',
    correlationId: 'corr-admin-1',
    causationId: 'cause-admin-1'
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsoleController],
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
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(HybridPolicyGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get(ConsoleController);
    commandBus = module.get(CommandBus);
    queryBus = module.get(QueryBus);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passes trace metadata into getHealthOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getHealthOverview('actor-1', trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getStatisticsOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getStatisticsOverview('actor-2', trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getDeletionQueueSummary queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getDeletionQueueSummary('actor-2b', trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2b',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getEmailSummary queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getEmailSummary(
      'actor-2bb',
      { organizationId: 11, messageStatus: 'accepted' },
      trace
    );

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2bb',
        organizationId: 11,
        messageStatus: 'accepted',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getEmailsOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getEmailsOverview(
      'actor-2bc',
      { page: 2, organizationId: 11, webhookAttentionState: 'attention' },
      trace
    );

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2bc',
        page: 2,
        organizationId: 11,
        webhookAttentionState: 'attention',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getEmailDetail queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getEmailDetail('actor-2bd', 101, trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2bd',
        emailMessageId: 101,
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getDeletionsOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getDeletionsOverview('actor-2c', { page: 3, entityType: 'user' }, trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2c',
        page: 3,
        entityType: 'user',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getOutboxSummary queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getOutboxSummary('actor-2d', trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2d',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getOutboxOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getOutboxOverview(
      'actor-2e',
      { page: 2, status: 'failed', filterTenantId: 'tenant-1' },
      trace
    );

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-2e',
        page: 2,
        status: 'failed',
        requestedTenantId: 'tenant-1',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getTenantsOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getTenantsOverview('actor-3', { page: 2 }, trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-3',
        page: 2,
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getAccessOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getAccessOverview('actor-4', { memberPage: 3 }, trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-4',
        memberPage: 3,
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getUsersOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getUsersOverview('actor-4b', { page: 2 }, trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-4b',
        page: 2,
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getUserDetail queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getUserDetail('actor-4c', 77, trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-4c',
        userId: 77,
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into deleteTenant commands', async () => {
    commandBus.execute.mockResolvedValue(undefined);

    await controller.deleteTenant('actor-5', 88, trace);

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-5',
        targetTenantId: '88',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into deleteUser commands', async () => {
    commandBus.execute.mockResolvedValue(undefined);

    await controller.deleteUser('42', 99, 7, trace);

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 42,
        id: 99,
        tenantId: 7,
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into removeMembership commands', async () => {
    commandBus.execute.mockResolvedValue(undefined);

    await controller.removeMembership('actor-6', 77, 33, trace);

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-6',
        memberId: '77',
        tenantId: '33',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });

  it('passes trace metadata into getInboxOverview queries', async () => {
    queryBus.execute.mockResolvedValue({});

    await controller.getInboxOverview('actor-7', trace);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-7',
        requestId: 'req-admin-1',
        correlationId: 'corr-admin-1',
        causationId: 'cause-admin-1'
      })
    );
  });
});
