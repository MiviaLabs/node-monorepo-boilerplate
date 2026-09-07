export const enum ContentAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete'
}

export const enum ContentAuditDisposition {
  Audit = 'audit',
  Both = 'both',
  Exclude = 'exclude'
}

export type ContentAuditDecision = {
  actionId: string;
  kind: ContentAuditDecisionKind;
  auditDisposition: ContentAuditDisposition;
  rationale: string;
};

export const CONTENT_AUDIT_DECISIONS: readonly ContentAuditDecision[] = [
  {
    actionId: 'content.list',
    kind: ContentAuditDecisionKind.Read,
    auditDisposition: ContentAuditDisposition.Exclude,
    rationale: 'Lists visible content entries only and does not expose protected secret data.'
  },
  {
    actionId: 'content.get',
    kind: ContentAuditDecisionKind.Read,
    auditDisposition: ContentAuditDisposition.Exclude,
    rationale: 'Returns one visible content entry in already authorized tenant and project scope.'
  },
  {
    actionId: 'content.attachments.list',
    kind: ContentAuditDecisionKind.Read,
    auditDisposition: ContentAuditDisposition.Exclude,
    rationale: 'Lists content attachment metadata for an already authorized content entry context.'
  },
  {
    actionId: 'content.comments.list',
    kind: ContentAuditDecisionKind.Read,
    auditDisposition: ContentAuditDisposition.Exclude,
    rationale: 'Lists content comments in an already authorized content entry context.'
  },
  {
    actionId: 'content.create',
    kind: ContentAuditDecisionKind.Write,
    auditDisposition: ContentAuditDisposition.Audit,
    rationale: 'Creates persisted content state and should be auditable.'
  },
  {
    actionId: 'content.update',
    kind: ContentAuditDecisionKind.Update,
    auditDisposition: ContentAuditDisposition.Audit,
    rationale: 'Mutates persisted content state and should be auditable.'
  },
  {
    actionId: 'content.delete',
    kind: ContentAuditDecisionKind.Delete,
    auditDisposition: ContentAuditDisposition.Audit,
    rationale: 'Soft deletes persisted content state and should be auditable.'
  },
  {
    actionId: 'content.attachments.add',
    kind: ContentAuditDecisionKind.Write,
    auditDisposition: ContentAuditDisposition.Audit,
    rationale: 'Links an uploaded file into content state and should be auditable.'
  },
  {
    actionId: 'content.comments.add',
    kind: ContentAuditDecisionKind.Write,
    auditDisposition: ContentAuditDisposition.Audit,
    rationale: 'Creates persisted content comment state and should be auditable.'
  },
  {
    actionId: 'content.comments.delete',
    kind: ContentAuditDecisionKind.Delete,
    auditDisposition: ContentAuditDisposition.Audit,
    rationale: 'Soft deletes content comment state and should be auditable.'
  }
] as const;
