import { describe, expect, it, jest } from '@jest/globals';

import { DeleteProjectCommand } from '../../../commands/delete-project.command';
import { DeleteProjectHandler } from '../delete-project.handler';

describe('DeleteProjectHandler', () => {
  it('delegates deletion to the projects service with roles', async () => {
    const projectsService = {
      deleteProject: jest.fn(async () => undefined)
    };

    const handler = new DeleteProjectHandler(projectsService as unknown as never);
    await handler.execute(
      new DeleteProjectCommand('12', '34', 'actor-34', ['tenant_admin'], '56', {
        requestId: 'req-3',
        correlationId: 'corr-3',
        causationId: 'cause-3'
      })
    );

    expect(projectsService.deleteProject as jest.Mock).toHaveBeenCalledWith(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      '56',
      {
        requestId: 'req-3',
        correlationId: 'corr-3',
        causationId: 'cause-3'
      }
    );
  });
});
