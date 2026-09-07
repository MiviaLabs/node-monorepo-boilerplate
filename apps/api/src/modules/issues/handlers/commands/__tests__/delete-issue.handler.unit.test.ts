import { describe, expect, it, jest } from '@jest/globals';

import { DeleteIssueHandler } from '../delete-issue.handler';

import type { DeleteIssueCommand } from '../../../commands';

describe('DeleteIssueHandler', () => {
  it('delegates issue deletion to the service with trace context', async () => {
    const deleteIssue = jest.fn(async (..._args: unknown[]) => undefined);
    const issuesService = {
      deleteIssue
    };
    const handler = new DeleteIssueHandler(issuesService as never);
    const command = {
      tenantId: '5',
      userId: '9',
      actorId: 'actor-9',
      roles: ['tenant_admin'],
      issueId: '77',
      requestId: 'req-3',
      correlationId: 'corr-3',
      causationId: 'cause-3'
    } as unknown as DeleteIssueCommand;

    await handler.execute(command);

    expect(deleteIssue).toHaveBeenCalledWith('5', '9', 'actor-9', ['tenant_admin'], '77', {
      requestId: 'req-3',
      correlationId: 'corr-3',
      causationId: 'cause-3'
    });
  });
});
