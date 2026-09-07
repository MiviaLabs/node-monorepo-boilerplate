import { describe, expect, it, jest } from '@jest/globals';

import { AddProjectMemberCommand } from '../../../commands/add-project-member.command';
import { AddProjectMemberHandler } from '../add-project-member.handler';

describe('AddProjectMemberHandler', () => {
  it('delegates member assignment to the projects service with actor context', async () => {
    const projectsService = {
      addProjectMember: jest.fn(async () => ({ userId: 78 }))
    };

    const handler = new AddProjectMemberHandler(projectsService as unknown as never);
    await handler.execute(
      new AddProjectMemberCommand('12', '34', 'actor-34', ['tenant_admin'], '56', '78', {
        requestId: 'req-4',
        correlationId: 'corr-4',
        causationId: 'cause-4'
      })
    );

    expect(projectsService.addProjectMember as jest.Mock).toHaveBeenCalledWith(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      '56',
      '78',
      {
        requestId: 'req-4',
        correlationId: 'corr-4',
        causationId: 'cause-4'
      }
    );
  });
});
