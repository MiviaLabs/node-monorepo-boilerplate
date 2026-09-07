import { describe, expect, it, jest } from '@jest/globals';

import { UpdateProjectCommand } from '../../../commands/update-project.command';
import { UpdateProjectDto } from '../../../dto';
import { PROJECT_VISIBILITY } from '../../../types/project.types';
import { UpdateProjectHandler } from '../update-project.handler';

describe('UpdateProjectHandler', () => {
  it('delegates updates to the projects service with roles', async () => {
    const dto = new UpdateProjectDto();
    dto.visibility = PROJECT_VISIBILITY.PRIVATE;

    const projectsService = {
      updateProject: jest.fn(async () => ({ id: 1, visibility: PROJECT_VISIBILITY.PRIVATE }))
    };

    const handler = new UpdateProjectHandler(projectsService as unknown as never);
    await handler.execute(
      new UpdateProjectCommand('12', '34', 'actor-34', ['tenant_user'], '56', dto, {
        requestId: 'req-2',
        correlationId: 'corr-2',
        causationId: 'cause-2'
      })
    );

    expect(projectsService.updateProject as jest.Mock).toHaveBeenCalledWith(
      '12',
      '34',
      'actor-34',
      ['tenant_user'],
      '56',
      dto,
      {
        requestId: 'req-2',
        correlationId: 'corr-2',
        causationId: 'cause-2'
      }
    );
  });
});
