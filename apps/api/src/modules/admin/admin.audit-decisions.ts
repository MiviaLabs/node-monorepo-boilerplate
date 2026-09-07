export const enum AdminAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete',
  AccessControl = 'access_control'
}

export const enum AdminAuditDisposition {
  Audit = 'audit',
  Both = 'both',
  Exclude = 'exclude'
}

export type AdminAuditDecision = {
  actionId: string;
  kind: AdminAuditDecisionKind;
  auditDisposition: AdminAuditDisposition;
  rationale: string;
};

export const ADMIN_AUDIT_DECISIONS: readonly AdminAuditDecision[] = [
  {
    actionId: 'admin.getHealthOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Returns privileged operational health, outbox backlog, and dead-letter posture that is security-relevant for platform operators.'
  },
  {
    actionId: 'admin.getStatisticsOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Returns protected cross-tenant business and event-delivery aggregates that are compliance- and security-relevant for admin access.'
  },
  {
    actionId: 'admin.getEmailSummary',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Returns cross-tenant tracked email delivery metrics and webhook attention posture, which is a sensitive operational read for admin operators.'
  },
  {
    actionId: 'admin.getEmailsOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Lists cross-tenant tracked email records, delivery identifiers, and webhook investigation posture for privileged operational access.'
  },
  {
    actionId: 'admin.getDeletionQueueSummary',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Returns cross-tenant retention and purge backlog posture, which is compliance-relevant and sensitive for platform operators.'
  },
  {
    actionId: 'admin.getDeletionsOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Lists cross-tenant soft-deleted users and organizations awaiting purge, so access to this retention queue must be audited.'
  },
  {
    actionId: 'admin.getOutboxSummary',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Returns privileged cross-tenant outbox backlog and retry posture, so operator access to delivery-state monitoring must be audited.'
  },
  {
    actionId: 'admin.getOutboxOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Lists cross-tenant outbox events, retry metadata, and delivery failures for operator investigation, which is a sensitive operational read.'
  },
  {
    actionId: 'admin.getTenantsOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Lists protected tenant inventory, provisioning posture, and diagnostics across the platform.'
  },
  {
    actionId: 'admin.getAccessOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Exposes protected membership, privilege, and invitation posture across tenants, so operator access must be audited.'
  },
  {
    actionId: 'admin.getUsersOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Lists protected global user identity, privilege, and organization-footprint data across tenants for admin operators.'
  },
  {
    actionId: 'admin.getUserDetail',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Audit,
    rationale:
      'Returns protected global user identity posture and cross-organization membership detail that must be audited for admin access.'
  },
  {
    actionId: 'admin.deleteTenant',
    kind: AdminAuditDecisionKind.Delete,
    auditDisposition: AdminAuditDisposition.Both,
    rationale:
      'Delegates a destructive tenant lifecycle mutation that already emits a domain event and therefore also requires audit coverage.'
  },
  {
    actionId: 'admin.deleteUser',
    kind: AdminAuditDecisionKind.Delete,
    auditDisposition: AdminAuditDisposition.Both,
    rationale:
      'Delegates a destructive user lifecycle mutation that already emits a domain event and therefore also requires audit coverage.'
  },
  {
    actionId: 'admin.removeMembership',
    kind: AdminAuditDecisionKind.Delete,
    auditDisposition: AdminAuditDisposition.Both,
    rationale:
      'Delegates an access-control removal mutation that already emits a domain event and therefore also requires audit coverage.'
  },
  {
    actionId: 'admin.getInboxOverview',
    kind: AdminAuditDecisionKind.Read,
    auditDisposition: AdminAuditDisposition.Exclude,
    rationale:
      'The endpoint currently throws before reading protected inbox data, so there is no completed sensitive read to audit yet.'
  }
] as const;
