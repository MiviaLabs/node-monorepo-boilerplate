export const enum PiiVaultAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete',
  AccessControl = 'access_control'
}

export const enum PiiVaultAuditDisposition {
  Audit = 'audit',
  Both = 'both',
  Exclude = 'exclude'
}

export type PiiVaultAuditDecision = {
  actionId: string;
  kind: PiiVaultAuditDecisionKind;
  auditDisposition: PiiVaultAuditDisposition;
  rationale: string;
};

export const ENCRYPTED_STORE_AUDIT_DECISIONS: readonly PiiVaultAuditDecision[] = [
  {
    actionId: 'vault.store',
    kind: PiiVaultAuditDecisionKind.Write,
    auditDisposition: PiiVaultAuditDisposition.Both,
    rationale:
      'Creates vault-backed tenant state and already emits a transactional outbox event, so it also requires audit coverage.'
  },
  {
    actionId: 'vault.retrieve',
    kind: PiiVaultAuditDecisionKind.Read,
    auditDisposition: PiiVaultAuditDisposition.Audit,
    rationale:
      'Returns decrypted vault plaintext over the HTTP API, which is a sensitive protected-data read.'
  },
  {
    actionId: 'vault.retrieveById',
    kind: PiiVaultAuditDecisionKind.Read,
    auditDisposition: PiiVaultAuditDisposition.Exclude,
    rationale:
      'This is an internal per-field helper used under higher-level audited flows; auditing each component fetch would overcount a single logical access.'
  },
  {
    actionId: 'vault.rotateKey',
    kind: PiiVaultAuditDecisionKind.Update,
    auditDisposition: PiiVaultAuditDisposition.Audit,
    rationale:
      'Rotates tenant cryptographic protection for stored vault data and is a security-sensitive mutation without a separate domain event.'
  },
  {
    actionId: 'vault.kmsRotationCheckpoint.poll',
    kind: PiiVaultAuditDecisionKind.Update,
    auditDisposition: PiiVaultAuditDisposition.Exclude,
    rationale:
      'Updates scheduler checkpoint bookkeeping only; it does not expose protected data or represent an operator-visible business mutation by itself.'
  }
] as const;
