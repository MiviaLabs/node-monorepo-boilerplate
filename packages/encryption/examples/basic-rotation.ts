/**
 * Basic Key Rotation Example
 *
 * Demonstrates the simplest possible key rotation workflow with tenant isolation.
 * All rotation operations are scoped to a specific organization for multi-tenancy.
 */

/* eslint-disable no-console */

import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';

import { createMockKmsProvider } from '../src/__mocks__/kms-mock';
import { KeyRotationService, createKeyRotationService } from '../src/services/key-rotation.service';

/**
 * Example 1: Re-encrypt a data key
 */
async function example1_reencryptDataKey() {
  console.log('\n=== Example 1: Re-encrypt Data Key ===\n');

  // Setup
  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  const rotationService = new KeyRotationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  // Create test keys
  mockKms.createTestKey('old-key');
  mockKms.createTestKey('new-key');

  // Generate a secure random data key (32 bytes for AES-256)
  const originalDataKey = randomBytes(32);
  console.log('Generated secure random data key, length:', originalDataKey.length, 'bytes');

  // Encrypt with old key
  const encryptedWithOldKey = await mockKms.encrypt(originalDataKey, 'old-key');
  console.log('Encrypted data key, length:', encryptedWithOldKey.length, 'bytes');

  // Re-encrypt to new key (scoped to organization)
  const organizationId = 'org-example-123';
  const reencrypted = await rotationService.reencryptDataKey(encryptedWithOldKey, {
    organizationId,
    currentKeyId: 'old-key',
    newKeyId: 'new-key'
  });

  console.log('Re-encryption complete for organization:', organizationId);
  console.log('Old key ID:', reencrypted.oldKeyId);
  console.log('New key ID:', reencrypted.newKeyId);

  // Verify we can decrypt with new key
  const decryptedWithNewKey = await mockKms.decrypt(reencrypted.encryptedDataKey, 'new-key');

  assert.deepStrictEqual(decryptedWithNewKey, originalDataKey);
  console.log('\n✅ Verification: Data key successfully re-encrypted!\n');
}

/**
 * Example 2: Validate rotation before starting
 */
async function example2_validateRotation() {
  console.log('\n=== Example 2: Validate Rotation ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  const rotationService = new KeyRotationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  // Create test keys
  mockKms.createTestKey('old-key');
  mockKms.createTestKey('new-key');

  // Validate rotation is possible (scoped to organization)
  const organizationId = 'org-example-123';
  try {
    await rotationService.validateRotation({
      organizationId,
      currentKeyId: 'old-key',
      newKeyId: 'new-key'
    });

    console.log('✅ Rotation validation passed!');
    console.log('Both keys are accessible and enabled.\n');
  } catch (error) {
    console.error('❌ Rotation validation failed:', error);
  }
}

/**
 * Example 3: Plan rotation for entities
 */
async function example3_planRotation() {
  console.log('\n=== Example 3: Plan Rotation ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  const rotationService = new KeyRotationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  // Simulate entities (scoped to organization)
  const organizationId = 'org-example-123';
  const entities = Array.from({ length: 1250 }, (_, i) => ({
    id: String(i),
    data: `value${i}`
  }));

  // Plan rotation with batch size of 100
  const plan = await rotationService.prepareRotationPlan(entities, {
    organizationId,
    currentKeyId: 'old-key',
    newKeyId: 'new-key',
    batchSize: 100
  });

  console.log('Total entities:', plan.totalEntities);
  console.log('Estimated batches:', plan.estimatedBatches);
  console.log('Batch size: 100');
  console.log('\n✅ Rotation plan created!\n');
}

/**
 * Example 4: Create rotation service with factory
 */
async function example4_factoryCreate() {
  console.log('\n=== Example 4: Create with Factory ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  const providerMap = new Map([['test-kms', mockKms]]);

  const rotationService = createKeyRotationService((name) => providerMap.get(name), 'test-kms');

  assert.ok(rotationService instanceof KeyRotationService);
  console.log('✅ Rotation service created with factory!\n');
}

/**
 * Example 5: Complete rotation workflow with tenant isolation
 */
async function example5_completeWorkflow() {
  console.log('\n=== Example 5: Complete Rotation Workflow ===\n');

  // Setup - rotation is scoped to a specific organization
  const organizationId = 'org-customer-456';
  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  const rotationService = new KeyRotationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  // Step 1: Create keys
  console.log('Step 1: Creating keys...');
  mockKms.createTestKey('customer-data-key-2023');
  mockKms.createTestKey('customer-data-key-2024');
  console.log('✅ Keys created\n');

  // Step 2: Validate rotation (scoped to organization)
  console.log('Step 2: Validating rotation...');
  await rotationService.validateRotation({
    organizationId,
    currentKeyId: 'customer-data-key-2023',
    newKeyId: 'customer-data-key-2024'
  });
  console.log('✅ Validation passed\n');

  // Step 3: Re-encrypt data key (scoped to organization for audit)
  console.log('Step 3: Re-encrypting data key...');
  const originalDataKey = randomBytes(32); // Securely generated 256-bit key
  const encryptedWithOldKey = await mockKms.encrypt(originalDataKey, 'customer-data-key-2023');
  console.log('Generated secure data key, length:', originalDataKey.length, 'bytes');

  const reencrypted = await rotationService.reencryptDataKey(encryptedWithOldKey, {
    organizationId,
    currentKeyId: 'customer-data-key-2023',
    newKeyId: 'customer-data-key-2024'
  });

  // Verify
  const decryptedWithNewKey = await mockKms.decrypt(
    reencrypted.encryptedDataKey,
    'customer-data-key-2024'
  );

  assert.deepStrictEqual(decryptedWithNewKey, originalDataKey);
  console.log('✅ Data key re-encrypted and verified\n');

  console.log('🎉 Rotation workflow completed successfully!\n');
}

/**
 * Run all examples
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Basic Key Rotation Examples                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await example1_reencryptDataKey();
    await example2_validateRotation();
    await example3_planRotation();
    await example4_factoryCreate();
    await example5_completeWorkflow();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   All examples completed successfully!                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
