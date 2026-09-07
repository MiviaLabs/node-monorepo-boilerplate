import {
  SYSTEM_AUDIT_DECISIONS,
  SystemAuditDecisionKind,
  SystemAuditDisposition
} from '../system.audit-decisions';

describe('SYSTEM_AUDIT_DECISIONS', () => {
  it('documents every system-module HTTP action with an explicit audit decision', () => {
    expect(SYSTEM_AUDIT_DECISIONS.map((entry) => entry.actionId)).toEqual([
      'system.listTenants',
      'system.createTenant',
      'system.updateTenant',
      'system.deleteTenant',
      'system.getMetrics',
      'system.getSettings',
      'system.updateSettings',
      'system.deadLetter.list',
      'system.deadLetter.replay',
      'system.deadLetter.delete',
      'system.eventReplay.start',
      'system.eventReplay.status',
      'system.eventReplay.cancel',
      'system.emailWebhooks.summary',
      'system.emailWebhooks.list',
      'system.emailWebhooks.reprocess'
    ]);
  });

  it('defaults every mutating action to audit or both', () => {
    const mutatingActions = SYSTEM_AUDIT_DECISIONS.filter((entry) =>
      [
        SystemAuditDecisionKind.Write,
        SystemAuditDecisionKind.Update,
        SystemAuditDecisionKind.Delete,
        SystemAuditDecisionKind.AccessControl
      ].includes(entry.kind)
    );

    expect(
      mutatingActions.every((entry) => entry.auditDisposition !== SystemAuditDisposition.Exclude)
    ).toBe(true);
  });

  it('audits only sensitive, security-relevant, or protected-data reads', () => {
    expect(
      SYSTEM_AUDIT_DECISIONS.filter((entry) => entry.kind === SystemAuditDecisionKind.Read)
    ).toEqual([
      expect.objectContaining({ actionId: 'system.listTenants' }),
      expect.objectContaining({ actionId: 'system.getMetrics' }),
      expect.objectContaining({ actionId: 'system.getSettings' }),
      expect.objectContaining({ actionId: 'system.deadLetter.list' }),
      expect.objectContaining({ actionId: 'system.eventReplay.status' }),
      expect.objectContaining({ actionId: 'system.emailWebhooks.summary' }),
      expect.objectContaining({ actionId: 'system.emailWebhooks.list' })
    ]);
  });
});
