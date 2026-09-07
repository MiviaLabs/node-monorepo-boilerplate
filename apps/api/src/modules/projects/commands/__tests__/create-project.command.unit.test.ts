import { describe, expect, it } from '@jest/globals';

import { CreateProjectDto } from '../../dto';
import { PROJECT_VISIBILITY } from '../../types/project.types';
import { CreateProjectCommand } from '../create-project.command';

describe('CreateProjectCommand', () => {
  it('stores tenant ID, actor ID, and DTO', () => {
    const dto = new CreateProjectDto();
    dto.name = 'Roadmap';
    dto.visibility = PROJECT_VISIBILITY.PUBLIC;

    const command = new CreateProjectCommand('12', '34', 'actor-34', dto, {
      requestId: 'req-1',
      correlationId: 'corr-1',
      causationId: 'cause-1'
    });

    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.dto).toBe(dto);
    expect(command.requestId).toBe('req-1');
    expect(command.correlationId).toBe('corr-1');
    expect(command.causationId).toBe('cause-1');
    expect(command.readonly).toBe(true);
  });
});
