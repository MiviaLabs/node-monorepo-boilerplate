import { describe, expect, it, jest } from '@jest/globals';

import { CreateProjectCommand } from '../../../commands/create-project.command';
import { CreateProjectDto } from '../../../dto';
import { PROJECT_VISIBILITY } from '../../../types/project.types';
import { CreateProjectHandler } from '../create-project.handler';

describe('CreateProjectHandler', () => {
  it('delegates creation to the projects service with actor context', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Roadmap';
    dto.visibility = PROJECT_VISIBILITY.PUBLIC;

    const projectsService = {
      createProject: jest.fn(async () => ({ id: 1, name: 'Roadmap' }))
    };

    const handler = new CreateProjectHandler(projectsService as unknown as never);
    await handler.execute(
      new CreateProjectCommand('12', '34', 'actor-34', dto, {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      })
    );

    expect(projectsService.createProject as jest.Mock).toHaveBeenCalledWith(
      '12',
      '34',
      'actor-34',
      dto,
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      }
    );
  });
});
