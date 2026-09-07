import {
  ISSUES_AUDIT_DECISIONS,
  IssuesAuditDecisionKind,
  IssuesAuditDisposition
} from '../issues.audit-decisions';

describe('ISSUES_AUDIT_DECISIONS', () => {
  it('documents every current issues HTTP action with an explicit audit decision', () => {
    expect(ISSUES_AUDIT_DECISIONS.map((entry) => entry.actionId)).toEqual([
      'issues.list',
      'issues.summary',
      'issues.get',
      'issues.comments.list',
      'issues.attachments.list',
      'issues.attachments.download',
      'issues.assignees.list',
      'issues.watchers.list',
      'issues.labels.list',
      'issues.relations.list',
      'issues.activity.list',
      'issues.create',
      'issues.update',
      'issues.delete',
      'issues.comments.add',
      'issues.attachments.reserve',
      'issues.attachments.add',
      'issues.attachments.delete',
      'issues.assignees.add',
      'issues.assignees.remove',
      'issues.watchers.add',
      'issues.watchers.remove',
      'issues.labels.create',
      'issues.labels.update',
      'issues.labels.delete',
      'issues.labels.add',
      'issues.labels.remove',
      'issues.relations.create',
      'issues.relations.delete'
    ]);
  });

  it('defaults mutating actions to audit or both', () => {
    const mutatingActions = ISSUES_AUDIT_DECISIONS.filter((entry) =>
      [
        IssuesAuditDecisionKind.Write,
        IssuesAuditDecisionKind.Update,
        IssuesAuditDecisionKind.Delete
      ].includes(entry.kind)
    );

    expect(
      mutatingActions.every((entry) => entry.auditDisposition !== IssuesAuditDisposition.Exclude)
    ).toBe(true);
  });
});
