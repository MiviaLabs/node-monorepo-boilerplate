import { describe, expect, it, jest } from '@jest/globals';

import { RemoveProjectMemberCommand } from '../../../commands/remove-project-member.command';
import { RemoveProjectMemberHandler } from '../remove-project-member.handler';

describe('RemoveProjectMemberHandler', () => {
  it('delegates member removal to the projects service with actor context', async () => {
    const projectsService = {
      removeProjectMember: jest.fn(async () => undefined)
    };

    const handler = new RemoveProjectMemberHandler(projectsService as unknown as never);
    await handler.execute(
      new RemoveProjectMemberCommand('12', '34', 'actor-34', ['tenant_admin'], '56', '78', {
        requestId: 'req-5',
        correlationId: 'corr-5',
        causationId: 'cause-5'
      })
    );

    expect(projectsService.removeProjectMember as jest.Mock).toHaveBeenCalledWith(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      '56',
      '78',
      {
        requestId: 'req-5',
        correlationId: 'corr-5',
        causationId: 'cause-5'
      }
    );
  });
});
