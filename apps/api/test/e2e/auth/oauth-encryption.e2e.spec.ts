import { AUTH_PROVIDER_FACTORY } from '@package/auth';
import { EncryptionService } from '@package/encryption';
import { hashEmail } from '@package/utils';

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
import type { AuthProviderFactory } from '@package/auth';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('Auth OAuth Encryption (E2E)', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let authService: AuthService;
  let encryptionService: EncryptionService;
  let organizationId: number;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    authService = server.app.get(AuthService);
    encryptionService = server.app.get(EncryptionService);

    const org = await createTestOrganization(server.app, 'OAuth Org');
    organizationId = org.organizationId;

    const authProviderFactory = server.app.get<AuthProviderFactory>(AUTH_PROVIDER_FACTORY);
    const authProvider = authProviderFactory.getDefaultProvider();
    if (!authProvider) {
      throw new Error('Expected default auth provider');
    }

    jest.spyOn(authProvider, 'getUserInfoFromToken').mockResolvedValue({
      userId: `oauth-user-${Date.now()}`,
      email: `oauth.integration.${Date.now()}@example.com`,
      name: 'OAuth Integration User',
      emailVerified: true,
      roles: [],
      permissions: [],
      tenantId: String(organizationId),
      attributes: {
        photoURL: 'https://example.com/avatar.png'
      }
    } as never);
  }, 120000);

  afterAll(async () => {
    if (organizationId) {
      await cleanupOrganization(server.app, organizationId);
    }
    await server.close();
  }, 30000);

  it('should create OAuth user and persist encrypted provider email fields', async () => {
    const result = await authService.authenticateWithOAuth(
      String(organizationId),
      'google.com',
      `oauth-token-${Date.now()}`
    );

    expect(result.isNewUser).toBe(true);

    const { users, userIdentities, eq } = await import('@package/db-core');
    const [createdUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(result.userInfo.userId)))
      .limit(1);
    const [createdIdentity] = await db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, Number(result.userInfo.userId)))
      .limit(1);

    expect(createdUser).toBeDefined();
    expect(createdIdentity).toBeDefined();
    expect(isEnvelope(createdUser?.emailEncrypted ?? null)).toBe(true);
    expect(isEnvelope(createdIdentity?.providerEmailEncrypted ?? null)).toBe(true);
    if (!createdUser?.emailEncrypted || !createdIdentity?.providerEmailEncrypted) {
      throw new Error('Expected encrypted fields to be present');
    }

    const decryptedUserEmail = await decryptEnvelope(encryptionService, createdUser.emailEncrypted);
    const decryptedProviderEmail = await decryptEnvelope(
      encryptionService,
      createdIdentity.providerEmailEncrypted
    );

    expect(decryptedUserEmail).toBe(result.profile.email?.trim().toLowerCase());
    expect(decryptedProviderEmail).toBe(result.profile.email);
    expect(createdIdentity?.providerEmailHash).toBe(hashEmail(result.profile.email ?? ''));
  });

  it('should successfully decrypt stored OAuth user data on read', async () => {
    // This test verifies the read path - that OAuth encrypted values can be decrypted
    const testEmail = `oauth.read.path.${Date.now()}@example.com`;

    const authProviderFactory = server.app.get<AuthProviderFactory>(AUTH_PROVIDER_FACTORY);
    const authProvider = authProviderFactory.getDefaultProvider();
    if (!authProvider) {
      throw new Error('Expected default auth provider');
    }

    jest.spyOn(authProvider, 'getUserInfoFromToken').mockResolvedValue({
      userId: `oauth-read-test-${Date.now()}`,
      email: testEmail,
      name: 'OAuth Read Test',
      emailVerified: true,
      roles: [],
      permissions: [],
      tenantId: String(organizationId),
      attributes: {}
    } as never);

    const result = await authService.authenticateWithOAuth(
      String(organizationId),
      'google.com',
      `oauth-token-read-${Date.now()}`
    );

    const { users, userIdentities, eq } = await import('@package/db-core');
    const [storedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(result.userInfo.userId)))
      .limit(1);
    const [storedIdentity] = await db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, Number(result.userInfo.userId)))
      .limit(1);

    // Verify encrypted fields exist and can be decrypted
    expect(storedUser?.emailEncrypted).toBeDefined();
    expect(storedIdentity?.providerEmailEncrypted).toBeDefined();

    // Decrypt and verify round-trip
    const decryptedEmail = await decryptEnvelope(encryptionService, storedUser!.emailEncrypted!);
    const decryptedProviderEmail = await decryptEnvelope(
      encryptionService,
      storedIdentity!.providerEmailEncrypted!
    );

    expect(decryptedEmail).toBe(testEmail.toLowerCase());
    expect(decryptedProviderEmail).toBe(testEmail);
  });
});
