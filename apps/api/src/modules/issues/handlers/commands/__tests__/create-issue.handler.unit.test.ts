import { describe, expect, it, jest } from '@jest/globals';

import { CreateIssueHandler } from '../create-issue.handler';

import type { CreateIssueCommand } from '../../../commands';

describe('CreateIssueHandler', () => {
  it('delegates issue creation to the service with trace context', async () => {
    const createIssue = jest.fn(async (..._args: unknown[]) => ({ id: 77 }));
    const issuesService = {
      createIssue
    };
    const handler = new CreateIssueHandler(issuesService as never);
    const command = {
      tenantId: '5',
      userId: '9',
      actorId: 'actor-9',
      roles: ['tenant_user'],
      dto: { title: 'Untitled issue' },
      requestId: 'req-1',
      correlationId: 'corr-1',
      causationId: 'cause-1'
    } as unknown as CreateIssueCommand;

    await handler.execute(command);

    expect(createIssue).toHaveBeenCalledWith(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { title: 'Untitled issue' },
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      }
    );
  });
});
