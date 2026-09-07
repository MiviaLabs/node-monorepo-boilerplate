import {
  CONTENT_AUDIT_DECISIONS,
  ContentAuditDecisionKind,
  ContentAuditDisposition
} from '../content.audit-decisions';

describe('CONTENT_AUDIT_DECISIONS', () => {
  it('documents every current content HTTP action with an explicit audit decision', () => {
    expect(CONTENT_AUDIT_DECISIONS.map((entry) => entry.actionId)).toEqual([
      'content.list',
      'content.get',
      'content.attachments.list',
      'content.comments.list',
      'content.create',
      'content.update',
      'content.delete',
      'content.attachments.add',
      'content.comments.add',
      'content.comments.delete'
    ]);
  });

  it('defaults mutating actions to audit or both', () => {
    const mutatingActions = CONTENT_AUDIT_DECISIONS.filter((entry) =>
      [
        ContentAuditDecisionKind.Write,
        ContentAuditDecisionKind.Update,
        ContentAuditDecisionKind.Delete
      ].includes(entry.kind)
    );

    expect(
      mutatingActions.every((entry) => entry.auditDisposition !== ContentAuditDisposition.Exclude)
    ).toBe(true);
  });
});
