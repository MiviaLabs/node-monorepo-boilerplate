import {
  STORAGE_AUDIT_DECISIONS,
  StorageAuditDecisionKind,
  StorageAuditDisposition
} from '../storage.audit-decisions';

describe('STORAGE_AUDIT_DECISIONS', () => {
  it('documents every storage-module action with an explicit audit decision', () => {
    expect(STORAGE_AUDIT_DECISIONS.map((entry) => entry.actionId)).toEqual([
      'storage.uploads.create',
      'storage.uploads.complete',
      'storage.files.get',
      'storage.files.downloadUrl',
      'storage.files.delete',
      'storage.files.purge',
      'storage.uploads.recoverPending'
    ]);
  });

  it('requires every mutating storage action to stay audited', () => {
    const mutatingActions = STORAGE_AUDIT_DECISIONS.filter(
      (entry) => entry.kind !== StorageAuditDecisionKind.Read
    );

    expect(
      mutatingActions.every((entry) => entry.auditDisposition === StorageAuditDisposition.Audit)
    ).toBe(true);
  });

  it('only audits sensitive storage reads', () => {
    const auditedReads = STORAGE_AUDIT_DECISIONS.filter(
      (entry) =>
        entry.kind === StorageAuditDecisionKind.Read &&
        entry.auditDisposition === StorageAuditDisposition.Audit
    ).map((entry) => entry.actionId);

    expect(auditedReads).toEqual(['storage.files.downloadUrl']);
  });
});
