import { describe, expect, it } from '@jest/globals';

import { AddProjectMemberCommand } from '../add-project-member.command';

describe('AddProjectMemberCommand', () => {
  it('stores actor, roles, target member, and trace', () => {
    const command = new AddProjectMemberCommand(
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

    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_admin']);
    expect(command.projectId).toBe('56');
    expect(command.memberId).toBe('78');
    expect(command.requestId).toBe('req-4');
    expect(command.correlationId).toBe('corr-4');
    expect(command.causationId).toBe('cause-4');
    expect(command.readonly).toBe(true);
  });
});
