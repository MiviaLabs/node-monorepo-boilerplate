export const enum StorageAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete',
  Maintenance = 'maintenance'
}

export const enum StorageAuditDisposition {
  Audit = 'audit',
  Exclude = 'exclude'
}

export type StorageAuditDecision = {
  actionId: string;
  kind: StorageAuditDecisionKind;
  auditDisposition: StorageAuditDisposition;
  rationale: string;
};

export const STORAGE_AUDIT_DECISIONS: readonly StorageAuditDecision[] = [
  {
    actionId: 'storage.uploads.create',
    kind: StorageAuditDecisionKind.Write,
    auditDisposition: StorageAuditDisposition.Audit,
    rationale:
      'Creates persisted file registry state and an upload capability, so the reservation should be auditable.'
  },
  {
    actionId: 'storage.uploads.complete',
    kind: StorageAuditDecisionKind.Update,
    auditDisposition: StorageAuditDisposition.Audit,
    rationale:
      'Transitions a file into the ready state after storage verification, which changes persisted access state and should be auditable.'
  },
  {
    actionId: 'storage.files.get',
    kind: StorageAuditDecisionKind.Read,
    auditDisposition: StorageAuditDisposition.Exclude,
    rationale:
      'Returns metadata only for the caller’s own direct file record and would create noisy self-service audit volume.'
  },
  {
    actionId: 'storage.files.downloadUrl',
    kind: StorageAuditDecisionKind.Read,
    auditDisposition: StorageAuditDisposition.Audit,
    rationale:
      'Returns a signed download capability for private file access, which is a security-relevant read even when owner-scoped.'
  },
  {
    actionId: 'storage.files.delete',
    kind: StorageAuditDecisionKind.Delete,
    auditDisposition: StorageAuditDisposition.Audit,
    rationale:
      'Soft deletes a file lifecycle record and starts retention-based purge processing, so the mutation should be auditable.'
  },
  {
    actionId: 'storage.files.purge',
    kind: StorageAuditDecisionKind.Maintenance,
    auditDisposition: StorageAuditDisposition.Audit,
    rationale:
      'Permanently removes the physical object and marks the file as purged, which is a system delete with compliance implications.'
  },
  {
    actionId: 'storage.uploads.recoverPending',
    kind: StorageAuditDecisionKind.Maintenance,
    auditDisposition: StorageAuditDisposition.Audit,
    rationale:
      'System reconciliation can finalize or fail stale pending uploads, so those maintenance mutations should be auditable.'
  }
] as const;
