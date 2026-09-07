import { describe, expect, it } from '@jest/globals';

import { DeleteContentEntryCommand } from '../delete-content-entry.command';

describe('DeleteContentEntryCommand', () => {
  it('stores tenant, actor, entry id, and trace metadata', () => {
    const command = new DeleteContentEntryCommand('12', '34', 'actor-34', ['tenant_admin'], '99', {
      requestId: 'req-3',
      correlationId: 'corr-3',
      causationId: 'cause-3'
    });

    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_admin']);
    expect(command.entryId).toBe('99');
    expect(command.requestId).toBe('req-3');
    expect(command.correlationId).toBe('corr-3');
    expect(command.causationId).toBe('cause-3');
    expect(command.readonly).toBe(true);
  });
});
