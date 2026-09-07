export const enum IssuesAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete'
}

export const enum IssuesAuditDisposition {
  Audit = 'audit',
  Both = 'both',
  Exclude = 'exclude'
}

export type IssuesAuditDecision = {
  actionId: string;
  kind: IssuesAuditDecisionKind;
  auditDisposition: IssuesAuditDisposition;
  rationale: string;
};

export const ISSUES_AUDIT_DECISIONS: readonly IssuesAuditDecision[] = [
  {
    actionId: 'issues.list',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Lists visible issue metadata only and excludes deleted rows.'
  },
  {
    actionId: 'issues.summary',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Returns aggregate counts only and does not expose sensitive content.'
  },
  {
    actionId: 'issues.get',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Returns issue detail for authorized actors but not protected secret data.'
  },
  {
    actionId: 'issues.comments.list',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Lists issue comments for an already authorized issue detail context.'
  },
  {
    actionId: 'issues.attachments.list',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Lists issue attachment metadata for an already authorized issue detail context.'
  },
  {
    actionId: 'issues.attachments.download',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Streams private issue attachment content and should be audited as a protected file-access read.'
  },
  {
    actionId: 'issues.assignees.list',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Lists issue assignees for an already authorized issue detail context.'
  },
  {
    actionId: 'issues.watchers.list',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Lists issue watchers for an already authorized issue detail context.'
  },
  {
    actionId: 'issues.labels.list',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Lists active tenant issue labels and does not expose protected secret data.'
  },
  {
    actionId: 'issues.relations.list',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Lists issue relations for an already authorized issue detail context.'
  },
  {
    actionId: 'issues.activity.list',
    kind: IssuesAuditDecisionKind.Read,
    auditDisposition: IssuesAuditDisposition.Exclude,
    rationale: 'Lists issue activity for an already authorized issue detail context.'
  },
  {
    actionId: 'issues.create',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale: 'Creates organization or project-scoped issue state and must be auditable.'
  },
  {
    actionId: 'issues.update',
    kind: IssuesAuditDecisionKind.Update,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale: 'Mutates issue state, including workflow status and priority, and must be auditable.'
  },
  {
    actionId: 'issues.delete',
    kind: IssuesAuditDecisionKind.Delete,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale: 'Soft deletes issue state and must be auditable as a destructive mutation.'
  },
  {
    actionId: 'issues.comments.add',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Adds persisted discussion to an issue and should be audited as a state-changing write.'
  },
  {
    actionId: 'issues.attachments.reserve',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Reserves an issue-scoped upload capability and should be audited as a state-changing write.'
  },
  {
    actionId: 'issues.attachments.add',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Links a persisted uploaded file into issue state and should be audited as a state-changing write.'
  },
  {
    actionId: 'issues.attachments.delete',
    kind: IssuesAuditDecisionKind.Delete,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Removes an attachment from issue state and initiates destructive file-retention lifecycle work.'
  },
  {
    actionId: 'issues.assignees.add',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Adds an assignee to an issue and should be audited as a collaboration-state mutation.'
  },
  {
    actionId: 'issues.assignees.remove',
    kind: IssuesAuditDecisionKind.Delete,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Removes an assignee from an issue and should be audited as a collaboration-state mutation.'
  },
  {
    actionId: 'issues.watchers.add',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Adds an explicit watcher to an issue and should be audited as a collaboration-state mutation.'
  },
  {
    actionId: 'issues.watchers.remove',
    kind: IssuesAuditDecisionKind.Delete,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Removes an explicit watcher from an issue and should be audited as a collaboration-state mutation.'
  },
  {
    actionId: 'issues.labels.create',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale: 'Creates a reusable tenant issue label and should be audited as a taxonomy mutation.'
  },
  {
    actionId: 'issues.labels.update',
    kind: IssuesAuditDecisionKind.Update,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale: 'Updates a reusable tenant issue label and should be audited as a taxonomy mutation.'
  },
  {
    actionId: 'issues.labels.delete',
    kind: IssuesAuditDecisionKind.Delete,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Soft deletes a reusable tenant issue label and should be audited as a destructive taxonomy mutation.'
  },
  {
    actionId: 'issues.labels.add',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale: 'Attaches a label to an issue and should be audited as a workflow-state mutation.'
  },
  {
    actionId: 'issues.labels.remove',
    kind: IssuesAuditDecisionKind.Delete,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale: 'Removes a label from an issue and should be audited as a workflow-state mutation.'
  },
  {
    actionId: 'issues.relations.create',
    kind: IssuesAuditDecisionKind.Write,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Creates a persisted issue dependency or linkage and should be audited as relationship state.'
  },
  {
    actionId: 'issues.relations.delete',
    kind: IssuesAuditDecisionKind.Delete,
    auditDisposition: IssuesAuditDisposition.Audit,
    rationale:
      'Removes a persisted issue dependency or linkage and should be audited as relationship state.'
  }
] as const;
