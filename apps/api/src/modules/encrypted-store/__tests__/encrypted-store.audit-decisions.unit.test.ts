import { describe, expect, it } from '@jest/globals';

import { ENCRYPTED_STORE_AUDIT_DECISIONS, PiiVaultAuditDisposition } from '../encrypted-store.audit-decisions';

describe('ENCRYPTED_STORE_AUDIT_DECISIONS', () => {
  it('covers the encrypted-store module action inventory with explicit dispositions', () => {
    expect(ENCRYPTED_STORE_AUDIT_DECISIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'vault.store',
          auditDisposition: PiiVaultAuditDisposition.Both
        }),
        expect.objectContaining({
          actionId: 'vault.retrieve',
          auditDisposition: PiiVaultAuditDisposition.Audit
        }),
        expect.objectContaining({
          actionId: 'vault.retrieveById',
          auditDisposition: PiiVaultAuditDisposition.Exclude
        }),
        expect.objectContaining({
          actionId: 'vault.rotateKey',
          auditDisposition: PiiVaultAuditDisposition.Audit
        }),
        expect.objectContaining({
          actionId: 'vault.kmsRotationCheckpoint.poll',
          auditDisposition: PiiVaultAuditDisposition.Exclude
        })
      ])
    );
  });
});
