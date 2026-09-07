import { describe, expect, it } from '@jest/globals';

import { UpdateProjectDto } from '../../dto';
import { PROJECT_VISIBILITY } from '../../types/project.types';
import { UpdateProjectCommand } from '../update-project.command';

describe('UpdateProjectCommand', () => {
  it('stores tenant ID, actor context, project ID, and DTO', () => {
    const dto = new UpdateProjectDto();
    dto.visibility = PROJECT_VISIBILITY.PRIVATE;

    const command = new UpdateProjectCommand('12', '34', 'actor-34', ['tenant_user'], '56', dto, {
      requestId: 'req-2',
      correlationId: 'corr-2',
      causationId: 'cause-2'
    });

    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_user']);
    expect(command.projectId).toBe('56');
    expect(command.dto).toBe(dto);
    expect(command.requestId).toBe('req-2');
    expect(command.correlationId).toBe('corr-2');
    expect(command.causationId).toBe('cause-2');
    expect(command.readonly).toBe(true);
  });
});
