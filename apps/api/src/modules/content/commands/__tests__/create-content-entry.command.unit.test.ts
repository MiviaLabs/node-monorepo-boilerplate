import { describe, expect, it } from '@jest/globals';

import { CreateContentEntryDto } from '../../dto';
import { CreateContentEntryCommand } from '../create-content-entry.command';

describe('CreateContentEntryCommand', () => {
  it('stores tenant, actor, dto, and trace metadata', () => {
    const dto = new CreateContentEntryDto();
    dto.title = 'Getting Started';
    dto.contentMarkdown = '# Getting Started';
    dto.projectId = 78;
    dto.parentId = 91;

    const command = new CreateContentEntryCommand('12', '34', 'actor-34', ['tenant_user'], dto, {
      requestId: 'req-1',
      correlationId: 'corr-1',
      causationId: 'cause-1'
    });

    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_user']);
    expect(command.dto).toBe(dto);
    expect(command.requestId).toBe('req-1');
    expect(command.correlationId).toBe('corr-1');
    expect(command.causationId).toBe('cause-1');
    expect(command.readonly).toBe(true);
  });
});
