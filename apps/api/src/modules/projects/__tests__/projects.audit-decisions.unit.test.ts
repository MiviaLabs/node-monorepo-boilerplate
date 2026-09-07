import {
  PROJECTS_AUDIT_DECISIONS,
  ProjectsAuditDecisionKind,
  ProjectsAuditDisposition
} from '../projects.audit-decisions';

describe('PROJECTS_AUDIT_DECISIONS', () => {
  it('documents every projects HTTP action with an explicit audit decision', () => {
    expect(PROJECTS_AUDIT_DECISIONS.map((entry) => entry.actionId)).toEqual([
      'projects.list',
      'projects.get',
      'projects.create',
      'projects.update',
      'projects.update.visibility',
      'projects.delete',
      'projects.members.list',
      'projects.members.add',
      'projects.members.remove'
    ]);
  });

  it('defaults mutating actions to audit or both', () => {
    const mutatingActions = PROJECTS_AUDIT_DECISIONS.filter((entry) =>
      [
        ProjectsAuditDecisionKind.Write,
        ProjectsAuditDecisionKind.Update,
        ProjectsAuditDecisionKind.Delete,
        ProjectsAuditDecisionKind.AccessControl
      ].includes(entry.kind)
    );

    expect(
      mutatingActions.every((entry) => entry.auditDisposition !== ProjectsAuditDisposition.Exclude)
    ).toBe(true);
  });
});
