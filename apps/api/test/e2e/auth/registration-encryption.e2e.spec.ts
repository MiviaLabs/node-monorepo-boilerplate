import { EncryptionService } from '@package/encryption';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { AuthService } from '../../../src/modules/auth/services/auth.service';
import { startTestServer } from '../../helpers/bootstrap';
import {
  cleanupOrganization,
  createTestOrganization,
  setupE2ETestDatabaseJest
} from '../../helpers/database';
import { decryptEnvelope, isEnvelope } from '../helpers/encryption.helpers';

import type { TestServer } from '../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('Auth Registration Encryption (E2E)', () => {
  type AuthServiceInternals = {
    provisionGcpUserSync: (
      email: string,
      password: string,
      displayName: string,
      gcpTenantId: string | null
    ) => Promise<string>;
    setUserCustomClaims: (
      gcpUid: string,
      tenantId: string,
      userId: number,
      gcpTenantId: string | null
    ) => Promise<void>;
  };

  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let authService: AuthService;
  let encryptionService: EncryptionService;
  let organizationId: number;
  const createdOrganizationIds: number[] = [];

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    authService = server.app.get(AuthService);
    encryptionService = server.app.get(EncryptionService);
    const org = await createTestOrganization(server.app, 'PII Org');
    organizationId = org.organizationId;
    createdOrganizationIds.push(organizationId);
    const authServiceInternals = authService as unknown as AuthServiceInternals;

    let gcpUidCounter = 0;
    jest.spyOn(authServiceInternals, 'provisionGcpUserSync').mockImplementation(async () => {
      gcpUidCounter += 1;
      return `gcp-user-test-registration-${gcpUidCounter}`;
    });
    jest.spyOn(authServiceInternals, 'setUserCustomClaims').mockResolvedValue(undefined);
  }, 120000);

  afterAll(async () => {
    for (const organizationId of createdOrganizationIds) {
      await cleanupOrganization(server.app, organizationId);
    }
    await server.close();
  }, 30000);

  it('should persist encrypted user and primary identity PII during registration', async () => {
    const mixedCaseEmail = `Pii.Register.${Date.now()}@Example.com`;
    const registerResult = await authService.registerWithEmailPassword(
      String(organizationId),
      mixedCaseEmail,
      'SecurePass123!',
      'Jane Doe',
      'PII Org'
    );

    const { users, userIdentities, eq } = await import('@package/db-core');
    const [createdUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, registerResult.user.id))
      .limit(1);
    const [primaryIdentity] = await db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, registerResult.user.id))
      .limit(1);

    expect(createdUser).toBeDefined();
    expect(primaryIdentity).toBeDefined();
    expect(isEnvelope(createdUser?.emailEncrypted ?? null)).toBe(true);
    expect(isEnvelope(createdUser?.firstNameEncrypted ?? null)).toBe(true);
    expect(isEnvelope(createdUser?.lastNameEncrypted ?? null)).toBe(true);
    expect(isEnvelope(primaryIdentity?.providerEmailEncrypted ?? null)).toBe(true);
    if (
      !createdUser?.emailEncrypted ||
      !createdUser.firstNameEncrypted ||
      !createdUser.lastNameEncrypted ||
      !primaryIdentity?.providerEmailEncrypted
    ) {
      throw new Error('Expected encrypted fields to be present');
    }

    const decryptedEmail = await decryptEnvelope(encryptionService, createdUser.emailEncrypted);
    const decryptedFirstName = await decryptEnvelope(
      encryptionService,
      createdUser.firstNameEncrypted
    );
    const decryptedLastName = await decryptEnvelope(
      encryptionService,
      createdUser.lastNameEncrypted
    );
    const decryptedIdentityEmail = await decryptEnvelope(
      encryptionService,
      primaryIdentity.providerEmailEncrypted
    );

    expect(decryptedEmail).toBe(mixedCaseEmail.trim().toLowerCase());
    expect(decryptedFirstName).toBe('Jane');
    expect(decryptedLastName).toBe('Doe');
    expect(decryptedIdentityEmail).toBe(mixedCaseEmail);
  });

  it('should successfully decrypt stored encrypted values on read', async () => {
    // This test verifies the read path - that encrypted values can be decrypted
    const email = `read.path.test.${Date.now()}@example.com`;
    const registerResult = await authService.registerWithEmailPassword(
      String(organizationId),
      email,
      'SecurePass123!',
      'Read Path Test',
      'PII Org'
    );

    const { users, userIdentities, eq } = await import('@package/db-core');
    const [storedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, registerResult.user.id))
      .limit(1);
    const [storedIdentity] = await db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, registerResult.user.id))
      .limit(1);

    // Verify all encrypted fields can be decrypted successfully
    expect(storedUser?.emailEncrypted).toBeDefined();
    expect(storedIdentity?.providerEmailEncrypted).toBeDefined();

    // Decrypt and verify round-trip
    const decryptedEmail = await decryptEnvelope(encryptionService, storedUser!.emailEncrypted!);
    const decryptedIdentityEmail = await decryptEnvelope(
      encryptionService,
      storedIdentity!.providerEmailEncrypted!
    );

    expect(decryptedEmail).toBe(email.toLowerCase());
    expect(decryptedIdentityEmail).toBe(email);
  });
});
