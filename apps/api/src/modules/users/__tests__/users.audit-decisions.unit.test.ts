import {
  USERS_AUDIT_DECISIONS,
  UsersAuditDecisionKind,
  UsersAuditDisposition
} from '../users.audit-decisions';

describe('USERS_AUDIT_DECISIONS', () => {
  it('documents every users-module HTTP action with an explicit audit decision', () => {
    expect(USERS_AUDIT_DECISIONS.map((entry) => entry.actionId)).toEqual([
      'users.findOne',
      'users.findAll',
      'users.create',
      'users.update',
      'users.delete',
      'userAddresses.findAll',
      'userAddresses.findDefault',
      'userAddresses.findOne',
      'userAddresses.create',
      'userAddresses.update',
      'userAddresses.delete',
      'addressKeyRotation.rotate',
      'addressKeyRotation.resume',
      'addressKeyRotation.cancel'
    ]);
  });

  it('defaults all writes, updates, and deletes to audit or both', () => {
    const mutatingActions = USERS_AUDIT_DECISIONS.filter((entry) =>
      [
        UsersAuditDecisionKind.Write,
        UsersAuditDecisionKind.Update,
        UsersAuditDecisionKind.Delete
      ].includes(entry.kind)
    );

    expect(
      mutatingActions.every((entry) => entry.auditDisposition !== UsersAuditDisposition.Exclude)
    ).toBe(true);
  });

  it('only excludes reads that are metadata-only', () => {
    expect(
      USERS_AUDIT_DECISIONS.filter(
        (entry) => entry.auditDisposition === UsersAuditDisposition.Exclude
      )
    ).toEqual([
      expect.objectContaining({ actionId: 'users.findOne' }),
      expect.objectContaining({ actionId: 'users.findAll' })
    ]);
  });
});
