import { describe, expect, it } from '@jest/globals';

import { RemoveProjectMemberCommand } from '../remove-project-member.command';

describe('RemoveProjectMemberCommand', () => {
  it('stores actor, roles, target member, and trace', () => {
    const command = new RemoveProjectMemberCommand(
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

    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_admin']);
    expect(command.projectId).toBe('56');
    expect(command.memberId).toBe('78');
    expect(command.requestId).toBe('req-5');
    expect(command.correlationId).toBe('corr-5');
    expect(command.causationId).toBe('cause-5');
    expect(command.readonly).toBe(true);
  });
});
