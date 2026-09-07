/**
 * Encryption Constants
 *
 * Cryptographic constants and configuration enums following NIST guidelines
 * and industry best practices.
 *
 * ## Security Standards Compliance
 *
 * | Standard | Requirement | Implementation |
 * |----------|-------------|----------------|
 * | NIST SP 800-38D | AES-GCM for authenticated encryption | AES_256_GCM default |
 * | NIST SP 800-131A | Minimum 128-bit keys for AES | Both 128/256 supported |
 * | PCI DSS 4.0 | Strong cryptography for cardholder data | AES-256-GCM recommended |
 * | FIPS 140-2 | Approved algorithms | AES-GCM is FIPS-approved |
 *
 * ## Cryptographic Constants
 *
 * These values are based on NIST recommendations:
 * - **IV Length**: 96 bits (12 bytes) for GCM as per NIST SP 800-38D
 * - **Auth Tag Length**: 128 bits (16 bytes) for full security
 * - **Key Length**: 256 bits (32 bytes) for AES-256
 *
 * @module encryption/constants
 *
 * @see https://csrc.nist.gov/publications/detail/sp/800-38d/final NIST GCM
 * @see https://csrc.nist.gov/publications/detail/sp/800-131a/rev-2/final NIST Key Lengths
 */

// ============================================================================
// CRYPTOGRAPHIC CONSTANTS
// ============================================================================

/**
 * AES-256 key length in bytes.
 *
 * 256 bits (32 bytes) provides quantum-resistant security margin
 * and is required for top-secret classification per NSA Suite B.
 *
 * @see NIST SP 800-131A for key length requirements
 */
export const AES_256_KEY_LENGTH = 32;

/**
 * AES-128 key length in bytes.
 *
 * 128 bits (16 bytes) meets NIST minimum requirements but
 * AES-256 is recommended for sensitive data.
 */
export const AES_128_KEY_LENGTH = 16;

/**
 * GCM IV (Initialization Vector) length in bytes.
 *
 * 96 bits (12 bytes) is the recommended IV length for GCM as per
 * NIST SP 800-38D. Using this length avoids additional processing
 * and is most efficient.
 *
 * **CRITICAL**: Never reuse an IV with the same key. Always generate
 * a fresh IV using crypto.randomBytes() for each encryption operation.
 *
 * @see NIST SP 800-38D Section 8.2
 */
export const GCM_IV_LENGTH = 12;

/**
 * GCM authentication tag length in bytes.
 *
 * 128 bits (16 bytes) provides full security. Shorter tags (96, 64 bits)
 * are allowed but reduce security guarantees.
 *
 * @see NIST SP 800-38D Table 2
 */
export const GCM_AUTH_TAG_LENGTH = 16;

// ============================================================================
// ALGORITHM ENUM
// ============================================================================

/**
 * Supported encryption algorithms.
 *
 * All algorithms use authenticated encryption (AEAD) to provide both
 * confidentiality and integrity protection. ECB and CBC modes are
 * intentionally NOT supported due to security weaknesses.
 *
 * ## Algorithm Comparison
 *
 * | Algorithm | Key Size | Security Level | Use Case |
 * |-----------|----------|----------------|----------|
 * | AES_256_GCM | 256 bits | Highest | PCI DSS, HIPAA, sensitive PII |
 * | AES_128_GCM | 128 bits | High | General purpose, high throughput |
 *
 * ## Security Recommendations
 *
 * - **Default**: Always use `AES_256_GCM` unless performance testing
 *   shows unacceptable overhead
 * - **Compliance**: PCI DSS and HIPAA both accept AES-128 but recommend AES-256
 * - **Future-proofing**: AES-256 provides margin against quantum computing
 *
 * ## What NOT to Use
 *
 * ❌ **ECB Mode**: Reveals patterns in data (the "ECB penguin" problem)
 * ❌ **CBC without HMAC**: Vulnerable to padding oracle attacks
 * ❌ **MD5/SHA-1**: Broken for cryptographic purposes
 * ❌ **DES/3DES**: Deprecated, insufficient key length
 * ❌ **Custom algorithms**: Never implement your own crypto
 *
 * @enum {string}
 */
export const enum EncryptionAlgorithm {
  /**
   * AES-256 in GCM mode (RECOMMENDED).
   *
   * - **Key Size**: 256 bits (32 bytes)
   * - **IV Size**: 96 bits (12 bytes)
   * - **Tag Size**: 128 bits (16 bytes)
   * - **Compliance**: FIPS 140-2, PCI DSS, HIPAA, SOC 2
   *
   * Provides authenticated encryption with highest security level.
   * Use for all sensitive data including PII, financial data, and secrets.
   */
  AES_256_GCM = 'aes-256-gcm',

  /**
   * AES-128 in GCM mode.
   *
   * - **Key Size**: 128 bits (16 bytes)
   * - **IV Size**: 96 bits (12 bytes)
   * - **Tag Size**: 128 bits (16 bytes)
   * - **Compliance**: FIPS 140-2, meets minimum NIST requirements
   *
   * Suitable when throughput is critical and data is not highly sensitive.
   * Still provides strong security but with smaller key size.
   */
  AES_128_GCM = 'aes-128-gcm'
}

// ============================================================================
// AZURE CREDENTIAL TYPES
// ============================================================================

/**
 * Azure credential types for Key Vault authentication.
 *
 * Azure supports multiple authentication methods with different security
 * characteristics and use cases.
 *
 * ## Credential Type Comparison
 *
 * | Type | Security | Use Case |
 * |------|----------|----------|
 * | DEFAULT | Highest | Automatic, tries multiple methods |
 * | MANAGED_IDENTITY | High | Azure VMs, App Service, AKS |
 * | CLIENT_SECRET | Medium | Service principals, CI/CD |
 *
 * ## Best Practices
 *
 * 1. **Prefer Managed Identity** when running in Azure
 * 2. **Use DefaultAzureCredential** for automatic method selection
 * 3. **Rotate client secrets** regularly (90 days recommended)
 * 4. **Never commit secrets** to source control
 *
 * @enum {string}
 */
export const enum AzureCredentialType {
  /**
   * Default Azure credential chain.
   *
   * Automatically tries multiple authentication methods in order:
   * 1. Environment variables
   * 2. Managed Identity
   * 3. Azure CLI
   * 4. Visual Studio Code
   * 5. Azure PowerShell
   *
   * **Recommended** for most scenarios as it adapts to the environment.
   */
  DEFAULT = 'default',

  /**
   * Managed Identity credential.
   *
   * Uses Azure's managed identity feature for passwordless authentication.
   * Available in Azure VMs, App Service, Functions, AKS, and other services.
   *
   * **Most secure** option when running in Azure as it requires no secrets.
   * Optionally specify `clientId` for user-assigned managed identities.
   */
  MANAGED_IDENTITY = 'managedIdentity',

  /**
   * Client secret (service principal) credential.
   *
   * Uses Azure AD application credentials (client ID + client secret).
   * Requires `tenantId`, `clientId`, and `clientSecret` configuration.
   *
   * **Use for**: CI/CD pipelines, external systems, development.
   * **Security**: Rotate secrets regularly, use Azure Key Vault for storage.
   */
  CLIENT_SECRET = 'clientSecret'
}
