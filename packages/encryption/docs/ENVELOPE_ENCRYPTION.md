# Envelope Encryption

This document explains the envelope encryption pattern implemented by `EnvelopeEncryptionService`.

## What is Envelope Encryption?

Envelope encryption is a multi-tier encryption strategy where:

1. Data is encrypted with a randomly generated Data Encryption Key (DEK)
2. The DEK is encrypted with a Key Encryption Key (KEK) from a KMS
3. Both the encrypted data and encrypted DEK are stored together

```text
+-------------------------------------------------------------+
|                    Encryption Flow                          |
+-------------------------------------------------------------+
|                                                             |
|   Plaintext --+---> [AES-256-GCM] ---> Ciphertext           |
|               |          ^                                  |
|               |          |                                  |
|               |     Random DEK                              |
|               |          |                                  |
|               |          v                                  |
|               +---> [KMS Encrypt] ---> Encrypted DEK        |
|                          ^                                  |
|                          |                                  |
|                     KEK (in KMS)                            |
|                                                             |
+-------------------------------------------------------------+
```

## Benefits

1. **Performance**: Symmetric encryption (AES) is fast for large data; KMS is only called once per operation regardless of data size.

2. **Key Rotation Flexibility**: Rotating the KEK only requires re-wrapping the DEKs, not re-encrypting all data. This makes rotation O(n) in records, not O(n) in data size.

3. **Reduced KMS API Calls**: One KMS call per encryption operation, not proportional to data size. This reduces latency, costs, and rate limits.

4. **Security Isolation**: Each piece of data has a unique DEK, limiting the blast radius if any single DEK is compromised.

5. **Compliance**: Can assist in meeting data-at-rest encryption requirements for frameworks such as PCI DSS, HIPAA, SOC 2, ISO 27001, and GDPR when combined with appropriate controls.

## Security Properties

| Property       | Value                   | Rationale                                       |
| -------------- | ----------------------- | ----------------------------------------------- |
| Algorithm      | AES-256-GCM             | NIST-approved authenticated encryption          |
| Key Size       | 256-bit DEK             | Sufficient key length for classical adversaries |
| IV             | 12-byte random IV       | Per NIST SP 800-38D                             |
| Auth Tag       | 16-byte tag             | Maximum integrity verification                  |
| Key Derivation | KMS GenerateDataKey API | Hardware-backed key generation                  |

## Usage Example

```typescript
import { EnvelopeEncryptionService } from '@package/encryption';
import { Logger } from '@nestjs/common';

const logger = new Logger('Encryption');

// Initialize with a KMS provider
const envelopeService = new EnvelopeEncryptionService(awsKmsProvider);

// Encrypt sensitive data with tenant context
const organizationId = 'org-123';
try {
  const result = await envelopeService.encrypt(sensitiveData, {
    keyId: `alias/org-${organizationId}-data-key`,
    organizationId
  });

  // Store all components with organization context
  await storeEncryptedData({
    organizationId,
    ciphertext: result.ciphertext,
    encryptedDataKey: result.encryptedDataKey,
    iv: result.iv,
    authTag: result.authTag
  });
} catch (error) {
  // Log error details without exposing plaintext or keys
  logger.error('Encryption failed', { error, organizationId });
  throw error;
}

// Later: retrieve and decrypt
try {
  const stored = await retrieveEncryptedData(id, organizationId);
  const plaintext = await envelopeService.decrypt(
    stored.ciphertext,
    stored.encryptedDataKey,
    stored.iv,
    stored.authTag,
    { organizationId }
  );
} catch (error) {
  logger.error('Decryption failed', { error, organizationId });
  throw error;
}
```

## Multi-Tenant Considerations

When using envelope encryption in multi-tenant environments:

- **Key Isolation per Organization**: Use tenant-specific key aliases (e.g., `alias/org-${organizationId}-data-key`) to ensure cryptographic isolation between tenants.
- **Preventing Cross-Tenant Access**: Always filter encrypted data queries by `organizationId` and validate tenant context before decryption operations.
- **Tenant-Scoped Key Rotation**: Rotate keys on a per-tenant basis using `KeyRotationService` with the tenant's `organizationId` to avoid impacting other tenants.
- **Adapter Pattern**: Implement `IEncryptionAdapter` for tenant-specific KMS configurations when different tenants require different KMS providers or key policies.

## Storage Requirements

All envelope encryption components must be stored together. Losing any component makes decryption impossible:

| Component          | Size           | Description                                     |
| ------------------ | -------------- | ----------------------------------------------- |
| `ciphertext`       | Variable       | Encrypted data (same size as plaintext for GCM) |
| `encryptedDataKey` | ~170-200 bytes | DEK wrapped by KEK                              |
| `iv`               | 12 bytes       | Initialization vector                           |
| `authTag`          | 16 bytes       | GCM authentication tag                          |

## Base64 Convenience Methods

For database storage where binary data must be stored as text:

```typescript
import { Logger } from '@nestjs/common';

const logger = new Logger('Encryption');
const organizationId = 'org-123';

try {
  // Encrypt to base64 with tenant context (for VARCHAR/TEXT columns)
  const base64Result = await envelopeService.encryptToBase64('sensitive data', {
    keyId: `alias/org-${organizationId}-data-key`,
    organizationId
  });
  // Returns: { ciphertext: string, encryptedDataKey: string, iv: string, authTag: string }

  // Decrypt from base64 with tenant context
  const plaintext = await envelopeService.decryptFromBase64(
    base64Result.ciphertext,
    base64Result.encryptedDataKey,
    base64Result.iv,
    base64Result.authTag,
    { organizationId }
  );
} catch (error) {
  // Log error without exposing sensitive data
  logger.error('Base64 encryption/decryption failed', { error, organizationId });
  throw error;
}
```

## Documentation References

- [Key Rotation Guide](./KEY_ROTATION_GUIDE.md) - How to rotate encryption keys
- [Performance Guide](./PERFORMANCE.md) - Optimization strategies
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
