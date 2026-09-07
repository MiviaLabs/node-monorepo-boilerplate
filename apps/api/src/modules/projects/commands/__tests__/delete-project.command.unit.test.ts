import { describe, expect, it } from '@jest/globals';

import { DeleteProjectCommand } from '../delete-project.command';

describe('DeleteProjectCommand', () => {
  it('stores tenant ID, actor context, and project ID', () => {
    const command = new DeleteProjectCommand('12', '34', 'actor-34', ['tenant_admin'], '56', {
      requestId: 'req-3',
      correlationId: 'corr-3',
      causationId: 'cause-3'
    });

    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_admin']);
    expect(command.projectId).toBe('56');
    expect(command.requestId).toBe('req-3');
    expect(command.correlationId).toBe('corr-3');
    expect(command.causationId).toBe('cause-3');
    expect(command.readonly).toBe(true);
  });
});
