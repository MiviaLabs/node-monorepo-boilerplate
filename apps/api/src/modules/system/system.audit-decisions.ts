export const enum SystemAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete',
  AccessControl = 'access_control'
}

export const enum SystemAuditDisposition {
  Audit = 'audit',
  Both = 'both',
  Exclude = 'exclude'
}

export type SystemAuditDecision = {
  actionId: string;
  kind: SystemAuditDecisionKind;
  auditDisposition: SystemAuditDisposition;
  rationale: string;
};

export const SYSTEM_AUDIT_DECISIONS: readonly SystemAuditDecision[] = [
  {
    actionId: 'system.listTenants',
    kind: SystemAuditDecisionKind.Read,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Lists protected tenant inventory across the platform, including identifiers and lifecycle status.'
  },
  {
    actionId: 'system.createTenant',
    kind: SystemAuditDecisionKind.Write,
    auditDisposition: SystemAuditDisposition.Both,
    rationale:
      'Creates platform tenant state and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'system.updateTenant',
    kind: SystemAuditDecisionKind.Update,
    auditDisposition: SystemAuditDisposition.Both,
    rationale:
      'Mutates protected tenant state and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'system.deleteTenant',
    kind: SystemAuditDecisionKind.Delete,
    auditDisposition: SystemAuditDisposition.Both,
    rationale:
      'Soft-deletes tenant access and lifecycle state and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'system.getMetrics',
    kind: SystemAuditDecisionKind.Read,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Returns protected operational and business metrics that are security-relevant for platform administration.'
  },
  {
    actionId: 'system.getSettings',
    kind: SystemAuditDecisionKind.Read,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Returns security- and compliance-relevant system configuration, so access must be audited.'
  },
  {
    actionId: 'system.updateSettings',
    kind: SystemAuditDecisionKind.Update,
    auditDisposition: SystemAuditDisposition.Both,
    rationale:
      'Mutates security-relevant platform configuration and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'system.deadLetter.list',
    kind: SystemAuditDecisionKind.Read,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Exposes dead-letter event metadata and failure context for privileged cross-tenant operations.'
  },
  {
    actionId: 'system.deadLetter.replay',
    kind: SystemAuditDecisionKind.Update,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Requeues dead-lettered events, which is a privileged operational mutation without a separate domain event.'
  },
  {
    actionId: 'system.deadLetter.delete',
    kind: SystemAuditDecisionKind.Delete,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Permanently removes dead-letter records, which is a destructive privileged operation without a separate domain event.'
  },
  {
    actionId: 'system.eventReplay.start',
    kind: SystemAuditDecisionKind.Write,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Starts a privileged replay workflow that can republish historical cross-tenant events.'
  },
  {
    actionId: 'system.eventReplay.status',
    kind: SystemAuditDecisionKind.Read,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Reads the status of a privileged replay workflow and is therefore security-relevant.'
  },
  {
    actionId: 'system.eventReplay.cancel',
    kind: SystemAuditDecisionKind.Update,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Cancels a privileged replay workflow, which is an explicit operational control mutation.'
  },
  {
    actionId: 'system.emailWebhooks.summary',
    kind: SystemAuditDecisionKind.Read,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Returns privileged cross-tenant webhook backlog and retry posture for operator investigation.'
  },
  {
    actionId: 'system.emailWebhooks.list',
    kind: SystemAuditDecisionKind.Read,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Lists cross-tenant email webhook processing records and failure context for privileged operations.'
  },
  {
    actionId: 'system.emailWebhooks.reprocess',
    kind: SystemAuditDecisionKind.Update,
    auditDisposition: SystemAuditDisposition.Audit,
    rationale:
      'Reprocesses persisted webhook events, which is an explicit privileged operational mutation without a separate domain event.'
  }
] as const;
