import {
  ADMIN_AUDIT_DECISIONS,
  AdminAuditDecisionKind,
  AdminAuditDisposition
} from '../admin.audit-decisions';

describe('ADMIN_AUDIT_DECISIONS', () => {
  it('documents every admin-module HTTP action with an explicit audit decision', () => {
    expect(ADMIN_AUDIT_DECISIONS.map((entry) => entry.actionId)).toEqual([
      'admin.getHealthOverview',
      'admin.getStatisticsOverview',
      'admin.getEmailSummary',
      'admin.getEmailsOverview',
      'admin.getDeletionQueueSummary',
      'admin.getDeletionsOverview',
      'admin.getOutboxSummary',
      'admin.getOutboxOverview',
      'admin.getTenantsOverview',
      'admin.getAccessOverview',
      'admin.getUsersOverview',
      'admin.getUserDetail',
      'admin.deleteTenant',
      'admin.deleteUser',
      'admin.removeMembership',
      'admin.getInboxOverview'
    ]);
  });

  it('defaults every mutating action to audit or both', () => {
    const mutatingActions = ADMIN_AUDIT_DECISIONS.filter((entry) =>
      [
        AdminAuditDecisionKind.Write,
        AdminAuditDecisionKind.Update,
        AdminAuditDecisionKind.Delete,
        AdminAuditDecisionKind.AccessControl
      ].includes(entry.kind)
    );

    expect(
      mutatingActions.every(
        (entry) => entry.auditDisposition !== AdminAuditDisposition.Exclude
      )
    ).toBe(true);
  });

  it('audits only sensitive, security-relevant, or protected-data reads', () => {
    expect(
      ADMIN_AUDIT_DECISIONS.filter((entry) => entry.kind === AdminAuditDecisionKind.Read)
    ).toEqual([
      expect.objectContaining({ actionId: 'admin.getHealthOverview' }),
      expect.objectContaining({ actionId: 'admin.getStatisticsOverview' }),
      expect.objectContaining({ actionId: 'admin.getEmailSummary' }),
      expect.objectContaining({ actionId: 'admin.getEmailsOverview' }),
      expect.objectContaining({ actionId: 'admin.getDeletionQueueSummary' }),
      expect.objectContaining({ actionId: 'admin.getDeletionsOverview' }),
      expect.objectContaining({ actionId: 'admin.getOutboxSummary' }),
      expect.objectContaining({ actionId: 'admin.getOutboxOverview' }),
      expect.objectContaining({ actionId: 'admin.getTenantsOverview' }),
      expect.objectContaining({ actionId: 'admin.getAccessOverview' }),
      expect.objectContaining({ actionId: 'admin.getUsersOverview' }),
      expect.objectContaining({ actionId: 'admin.getUserDetail' }),
      expect.objectContaining({
        actionId: 'admin.getInboxOverview',
        auditDisposition: AdminAuditDisposition.Exclude
      })
    ]);
  });
});
