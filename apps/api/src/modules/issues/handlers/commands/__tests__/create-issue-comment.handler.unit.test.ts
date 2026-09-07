import { describe, expect, it, jest } from '@jest/globals';

import { CreateIssueCommentHandler } from '../create-issue-comment.handler';

import type { CreateIssueCommentCommand } from '../../../commands';

describe('CreateIssueCommentHandler', () => {
  it('delegates comment creation to the issues service with trace metadata', async () => {
    const createIssueComment = jest.fn(async (..._args: unknown[]) => ({ id: 77 }));
    const issuesService = {
      createIssueComment
    };
    const handler = new CreateIssueCommentHandler(issuesService as never);
    const command = {
      tenantId: '5',
      userId: '9',
      actorId: 'actor-9',
      roles: ['tenant_user'],
      issueId: '77',
      dto: { bodyMarkdown: 'Looks good.' },
      requestId: 'req-1',
      correlationId: 'corr-1',
      causationId: 'cause-1'
    } as unknown as CreateIssueCommentCommand;

    const result = await handler.execute(command);

    expect(createIssueComment).toHaveBeenCalledWith(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      '77',
      { bodyMarkdown: 'Looks good.' },
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      }
    );
    expect(result).toEqual({ id: 77 });
  });
});
