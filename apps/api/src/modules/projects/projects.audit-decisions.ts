export const enum ProjectsAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete',
  AccessControl = 'access_control'
}

export const enum ProjectsAuditDisposition {
  Audit = 'audit',
  Both = 'both',
  Exclude = 'exclude'
}

export type ProjectsAuditDecision = {
  actionId: string;
  kind: ProjectsAuditDecisionKind;
  auditDisposition: ProjectsAuditDisposition;
  rationale: string;
};

export const PROJECTS_AUDIT_DECISIONS: readonly ProjectsAuditDecision[] = [
  {
    actionId: 'projects.list',
    kind: ProjectsAuditDecisionKind.Read,
    auditDisposition: ProjectsAuditDisposition.Exclude,
    rationale:
      'Lists project metadata only and excludes soft-deleted rows, without returning decrypted or high-sensitivity data.'
  },
  {
    actionId: 'projects.get',
    kind: ProjectsAuditDecisionKind.Read,
    auditDisposition: ProjectsAuditDisposition.Exclude,
    rationale:
      'Returns project metadata only; access control is enforced but the payload is not sensitive protected data.'
  },
  {
    actionId: 'projects.create',
    kind: ProjectsAuditDecisionKind.Write,
    auditDisposition: ProjectsAuditDisposition.Audit,
    rationale:
      'Creates organization-scoped project state and should be auditable even without a separate domain event stream.'
  },
  {
    actionId: 'projects.update',
    kind: ProjectsAuditDecisionKind.Update,
    auditDisposition: ProjectsAuditDisposition.Audit,
    rationale:
      'Mutates organization-scoped project state, including visibility, which affects who can access the resource.'
  },
  {
    actionId: 'projects.update.visibility',
    kind: ProjectsAuditDecisionKind.AccessControl,
    auditDisposition: ProjectsAuditDisposition.Audit,
    rationale:
      'Changing project visibility modifies access semantics for tenant users and must be audited as an access-control mutation.'
  },
  {
    actionId: 'projects.delete',
    kind: ProjectsAuditDecisionKind.Delete,
    auditDisposition: ProjectsAuditDisposition.Audit,
    rationale:
      'Soft-deletes project state and therefore represents a privileged destructive mutation that must be audited.'
  },
  {
    actionId: 'projects.members.list',
    kind: ProjectsAuditDecisionKind.Read,
    auditDisposition: ProjectsAuditDisposition.Exclude,
    rationale:
      'Lists project member metadata for authorized managers without exposing encrypted or secret fields.'
  },
  {
    actionId: 'projects.members.add',
    kind: ProjectsAuditDecisionKind.AccessControl,
    auditDisposition: ProjectsAuditDisposition.Audit,
    rationale:
      'Assigning a member changes access to project-scoped resources and must be audited as an access-control mutation.'
  },
  {
    actionId: 'projects.members.remove',
    kind: ProjectsAuditDecisionKind.AccessControl,
    auditDisposition: ProjectsAuditDisposition.Audit,
    rationale:
      'Removing a project member revokes access to project-scoped resources and must be audited as an access-control mutation.'
  }
] as const;
