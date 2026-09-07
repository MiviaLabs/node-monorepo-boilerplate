export const enum UsersAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete',
  AccessControl = 'access_control'
}

export const enum UsersAuditDisposition {
  Audit = 'audit',
  Both = 'both',
  Exclude = 'exclude'
}

export type UsersAuditDecision = {
  actionId: string;
  kind: UsersAuditDecisionKind;
  auditDisposition: UsersAuditDisposition;
  rationale: string;
};

export const USERS_AUDIT_DECISIONS: readonly UsersAuditDecision[] = [
  {
    actionId: 'users.findOne',
    kind: UsersAuditDecisionKind.Read,
    auditDisposition: UsersAuditDisposition.Exclude,
    rationale:
      'Returns metadata-only user identifiers and timestamps, not decrypted or Class-C data.'
  },
  {
    actionId: 'users.findAll',
    kind: UsersAuditDecisionKind.Read,
    auditDisposition: UsersAuditDisposition.Exclude,
    rationale: 'Lists metadata-only user records without decrypted or compliance-sensitive fields.'
  },
  {
    actionId: 'users.create',
    kind: UsersAuditDecisionKind.Write,
    auditDisposition: UsersAuditDisposition.Both,
    rationale:
      'Creates tenant-scoped user state and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'users.update',
    kind: UsersAuditDecisionKind.Update,
    auditDisposition: UsersAuditDisposition.Both,
    rationale:
      'Mutates tenant-scoped user state and must be audited in addition to its domain event.'
  },
  {
    actionId: 'users.delete',
    kind: UsersAuditDecisionKind.Delete,
    auditDisposition: UsersAuditDisposition.Both,
    rationale: 'Soft-deletes user state and must be audited in addition to its domain event.'
  },
  {
    actionId: 'userAddresses.findAll',
    kind: UsersAuditDecisionKind.Read,
    auditDisposition: UsersAuditDisposition.Audit,
    rationale:
      'Returns decrypted address components and encrypted-store-backed references, which are sensitive protected data.'
  },
  {
    actionId: 'userAddresses.findDefault',
    kind: UsersAuditDecisionKind.Read,
    auditDisposition: UsersAuditDisposition.Audit,
    rationale: 'Returns decrypted default address data, which is sensitive protected data.'
  },
  {
    actionId: 'userAddresses.findOne',
    kind: UsersAuditDecisionKind.Read,
    auditDisposition: UsersAuditDisposition.Audit,
    rationale:
      'Returns decrypted address data and encrypted-store references for a specific record, which is sensitive protected data.'
  },
  {
    actionId: 'userAddresses.create',
    kind: UsersAuditDecisionKind.Write,
    auditDisposition: UsersAuditDisposition.Both,
    rationale:
      'Creates encrypted-store-backed address state and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'userAddresses.update',
    kind: UsersAuditDecisionKind.Update,
    auditDisposition: UsersAuditDisposition.Both,
    rationale:
      'Mutates encrypted-store-backed address state and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'userAddresses.delete',
    kind: UsersAuditDecisionKind.Delete,
    auditDisposition: UsersAuditDisposition.Both,
    rationale:
      'Soft-deletes encrypted-store-backed address state and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'addressKeyRotation.rotate',
    kind: UsersAuditDecisionKind.Write,
    auditDisposition: UsersAuditDisposition.Audit,
    rationale:
      'Initiates a cryptographic tenant-scoped key rotation workflow, which is security-sensitive and audit-only.'
  },
  {
    actionId: 'addressKeyRotation.resume',
    kind: UsersAuditDecisionKind.Update,
    auditDisposition: UsersAuditDisposition.Audit,
    rationale:
      'Resumes a cryptographic tenant-scoped key rotation workflow, which is security-sensitive and audit-only.'
  },
  {
    actionId: 'addressKeyRotation.cancel',
    kind: UsersAuditDecisionKind.Update,
    auditDisposition: UsersAuditDisposition.Audit,
    rationale:
      'Cancels a cryptographic tenant-scoped key rotation workflow, which is security-sensitive and audit-only.'
  }
] as const;
