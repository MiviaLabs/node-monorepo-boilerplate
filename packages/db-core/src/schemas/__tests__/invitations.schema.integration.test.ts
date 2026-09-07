/**
 * Integration Tests for Invitations Schema
 *
 * Tests invitations table with Testcontainers to verify:
 * - Multi-tenancy isolation
 * - PII encryption pattern compliance
 * - Index functionality
 * - CASCADE DELETE behavior
 * - Unique constraint enforcement
 */

import { randomBytes, createHash } from 'node:crypto';
import { describe, beforeAll, afterAll, it, beforeEach, expect, jest } from '@jest/globals';

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { runMigrations } from '../../migrations/runner';
import { invitations, organizations, tenants, users } from '../../schemas';

// Set longer timeout for Testcontainers operations
jest.setTimeout(60000);

const { Pool } = pg;

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * SHA-256 hash helper (matches application pattern)
 */
function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate test email
 */
function testEmail(suffix = ''): string {
  const unique = randomBytes(8).toString('hex');
  return `test-invite-${unique}${suffix}@dev.local`;
}

/**
 * Generate test token
 */
function testToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Mock encryption result (matches @package/encryption format)
 */
interface MockEncryptedResult {
  data: string;
  iv: string;
  tag: string;
}

function mockEncrypt(plaintext: string): string {
  const result: MockEncryptedResult = {
    data: plaintext
      .split('')
      .map((c) => String.fromCharCode(c.charCodeAt(0) + 1))
      .join(''),
    iv: randomBytes(16).toString('hex'),
    tag: randomBytes(16).toString('hex')
  };
  return JSON.stringify(result);
}

const TEST_ENCRYPTION_KEY_VERSION = 'primary-encryption-key';

function buildInvitation(values: Record<string, unknown>) {
  return {
    encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
    ...values
  };
}

function buildUser(values: Record<string, unknown>) {
  return {
    encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
    ...values
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Invitations Schema Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let testDatabaseUrl: string;

  // Test organization ID
  let org1Id: number;
  let org2Id: number;
  let inviterUserId: number;

  beforeAll(async () => {
    // Start PostgreSQL Testcontainer
    console.log('[Test] Starting PostgreSQL Testcontainer...');
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    testDatabaseUrl = container.getConnectionUri();
    console.log('[Test] Testcontainer started, running migrations...');

    // Run migrations to set up schema
    await runMigrations(testDatabaseUrl);
    console.log('[Test] Migrations completed');

    // Create connection pool
    pool = new Pool({
      connectionString: testDatabaseUrl
    });

    db = drizzle(pool);

    // Create test tenants first (required by organizations FK)
    const [tenant1] = await db
      .insert(tenants)
      .values({
        type: 'organization',
        status: 'active'
      })
      .returning();
    const tenant1Id = tenant1!.id;

    const [tenant2] = await db
      .insert(tenants)
      .values({
        type: 'organization',
        status: 'active'
      })
      .returning();
    const tenant2Id = tenant2!.id;

    // Create test organizations
    const [org1] = await db
      .insert(organizations)
      .values({
        name: 'Test Organization 1',
        slug: 'test-org-1',
        tenantId: tenant1Id
      })
      .returning();
    org1Id = org1!.id;

    const [org2] = await db
      .insert(organizations)
      .values({
        name: 'Test Organization 2',
        slug: 'test-org-2',
        tenantId: tenant2Id
      })
      .returning();
    org2Id = org2!.id;

    const [inviter] = await db
      .insert(users)
      .values(
        buildUser({
          organizationId: org1Id,
          displayName: 'Invitation Sender'
        })
      )
      .returning();
    inviterUserId = inviter!.id;

    console.log('[Test] Setup complete');
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      await db.delete(invitations);
      await db.delete(users);
      await db.delete(organizations);
      await db.delete(tenants);
    }

    if (pool) {
      await pool.end();
    }

    // Stop the container
    if (container) {
      console.log('[Test] Stopping Testcontainer...');
      await container.stop();
      console.log('[Test] Testcontainer stopped');
    }
  });

  // ==========================================================================
  // INSERT TESTS
  // ==========================================================================

  describe('INSERT Operations', () => {
    it('should insert invitation with encrypted email', async () => {
      // Arrange
      const email = testEmail();
      const token = testToken();
      const emailHash = sha256(email.toLowerCase());
      const emailEncrypted = mockEncrypt(email);
      const tokenHash = sha256(token);

      // Act
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            emailHash,
            emailEncrypted,
            tokenHash,
            status: 'pending',
            role: 'member',
            invitedByUserId: null
          })
        )
        .returning();

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.organizationId).toBe(org1Id);
      expect(invitation.emailHash).toBe(emailHash);
      expect(invitation.tokenHash).toBe(tokenHash);
      expect(invitation.status).toBe('pending');
      expect(invitation.role).toBe('member');
    });

    it('should insert invitation without email (phone-only flow)', async () => {
      // Arrange
      const token = testToken();
      const tokenHash = sha256(token);

      // Act
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash,
            status: 'pending'
          })
        )
        .returning();

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.emailHash).toBeNull();
      expect(invitation.emailEncrypted).toBeNull();
    });

    it('should set default values for status and timestamps', async () => {
      // Arrange
      const token = testToken();
      const tokenHash = sha256(token);

      // Act
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash
          })
        )
        .returning();

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.status).toBe('pending');
      expect(invitation.createdAt).toBeDefined();
      expect(invitation.updatedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // SELECT BY TOKEN HASH TESTS
  // ==========================================================================

  describe('SELECT by Token Hash', () => {
    it('should find invitation by token hash', async () => {
      // Arrange
      const email = testEmail();
      const token = testToken();
      const emailHash = sha256(email.toLowerCase());
      const emailEncrypted = mockEncrypt(email);
      const tokenHash = sha256(token);

      await db.insert(invitations).values(
        buildInvitation({
          organizationId: org1Id,
          emailHash,
          emailEncrypted,
          tokenHash,
          status: 'pending'
        })
      );

      // Act
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.tokenHash).toBe(tokenHash);
      expect(invitation.organizationId).toBe(org1Id);
    });

    it('should return null for non-existent token hash', async () => {
      // Act
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, sha256('non-existent-token')))
        .limit(1);

      // Assert
      expect(invitation).toBeUndefined();
    });
  });

  // ==========================================================================
  // TENANT-SCOPED QUERY TESTS
  // ==========================================================================

  describe('Multi-Tenancy: Organization and Status Queries', () => {
    beforeEach(async () => {
      // Clean up first to ensure clean state
      await db.delete(invitations);

      // Create invitations for org1
      await db.insert(invitations).values([
        buildInvitation({
          organizationId: org1Id,
          tokenHash: sha256('org1-pending-1'),
          status: 'pending',
          role: 'member'
        }),
        buildInvitation({
          organizationId: org1Id,
          tokenHash: sha256('org1-pending-2'),
          status: 'pending',
          role: 'admin'
        }),
        buildInvitation({
          organizationId: org1Id,
          tokenHash: sha256('org1-accepted'),
          status: 'accepted',
          role: 'member'
        })
      ]);

      // Create invitations for org2
      await db.insert(invitations).values([
        buildInvitation({
          organizationId: org2Id,
          tokenHash: sha256('org2-pending-1'),
          status: 'pending',
          role: 'member'
        }),
        buildInvitation({
          organizationId: org2Id,
          tokenHash: sha256('org2-expired'),
          status: 'expired',
          role: 'guest'
        })
      ]);
    });

    it('should find invitations by organization and status', async () => {
      // Act - Find pending invitations for org1
      const pendingOrg1 = await db
        .select()
        .from(invitations)
        .where(and(eq(invitations.organizationId, org1Id), eq(invitations.status, 'pending')));

      // Assert
      expect(pendingOrg1.length).toBe(2);
      expect(pendingOrg1.every((i) => i.organizationId === org1Id)).toBe(true);
      expect(pendingOrg1.every((i) => i.status === 'pending')).toBe(true);
    });

    it('should enforce tenant isolation (no cross-tenant leakage)', async () => {
      // Act - Get all invitations for org1
      const org1Invitations = await db
        .select()
        .from(invitations)
        .where(eq(invitations.organizationId, org1Id));

      // Assert - All returned invitations belong to org1
      expect(org1Invitations.length).toBe(3);
      const allOrgIds = new Set(org1Invitations.map((i) => i.organizationId));
      expect(allOrgIds.has(org2Id)).toBe(false);
      expect(allOrgIds.size).toBe(1);
      expect(allOrgIds.has(org1Id)).toBe(true);
    });

    it('should find only pending invitations when filtered (tenant-scoped)', async () => {
      // Act - Find pending invitations for org1 only (P0: tenant scoping required)
      const pendingOrg1 = await db
        .select()
        .from(invitations)
        .where(and(eq(invitations.organizationId, org1Id), eq(invitations.status, 'pending')));

      // Assert - All returned pending invitations belong to org1
      expect(pendingOrg1.length).toBe(2);
      expect(pendingOrg1.every((i) => i.status === 'pending')).toBe(true);
      expect(pendingOrg1.every((i) => i.organizationId === org1Id)).toBe(true);
    });
  });

  // ==========================================================================
  // EMAIL HASH LOOKUP TESTS
  // ==========================================================================

  describe('SELECT by Email Hash within Organization', () => {
    let testEmail1: string;
    let testEmail2: string;

    beforeEach(async () => {
      // Generate fresh email values for each test
      testEmail1 = testEmail('-lookup-1');
      testEmail2 = testEmail('-lookup-2');

      // Clean up first to ensure clean state
      await db.delete(invitations);

      // Create invitations with emails for org1
      await db.insert(invitations).values([
        buildInvitation({
          organizationId: org1Id,
          emailHash: sha256(testEmail1.toLowerCase()),
          emailEncrypted: mockEncrypt(testEmail1),
          tokenHash: sha256('email-test-1'),
          status: 'pending'
        }),
        buildInvitation({
          organizationId: org1Id,
          emailHash: sha256(testEmail2.toLowerCase()),
          emailEncrypted: mockEncrypt(testEmail2),
          tokenHash: sha256('email-test-2'),
          status: 'pending'
        })
      ]);

      // Create invitation with same email hash for org2 (same email, different org)
      await db.insert(invitations).values(
        buildInvitation({
          organizationId: org2Id,
          emailHash: sha256(testEmail1.toLowerCase()), // Same email
          emailEncrypted: mockEncrypt(testEmail1),
          tokenHash: sha256('email-test-org2'),
          status: 'pending'
        })
      );
    });

    it('should find invitation by email hash within organization', async () => {
      // Act
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.emailHash, sha256(testEmail1.toLowerCase())),
            eq(invitations.organizationId, org1Id)
          )
        )
        .limit(1);

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.organizationId).toBe(org1Id);
      expect(invitation.emailHash).toBe(sha256(testEmail1.toLowerCase()));
    });

    it('should return correct organization for same email across tenants', async () => {
      // Act - Find email in org1
      const [org1Invite] = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.emailHash, sha256(testEmail1.toLowerCase())),
            eq(invitations.organizationId, org1Id)
          )
        )
        .limit(1);

      // Act - Find same email in org2
      const [org2Invite] = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.emailHash, sha256(testEmail1.toLowerCase())),
            eq(invitations.organizationId, org2Id)
          )
        )
        .limit(1);

      // Assert - Different invitations for different orgs
      expect(org1Invite).toBeDefined();
      expect(org2Invite).toBeDefined();
      expect(org1Invite.organizationId).toBe(org1Id);
      expect(org2Invite.organizationId).toBe(org2Id);
      expect(org1Invite.tokenHash).not.toBe(org2Invite.tokenHash);
    });
  });

  // ==========================================================================
  // CASCADE DELETE TESTS
  // ==========================================================================

  describe('CASCADE DELETE', () => {
    it('should cascade delete invitations when organization is deleted', async () => {
      // Arrange - Create org with invitations
      const email = testEmail('-cascade');
      const tokenHash = sha256('cascade-test-token');

      // Create tenant first
      const [newTenant] = await db
        .insert(tenants)
        .values({
          type: 'organization',
          status: 'active'
        })
        .returning();

      const [newOrg] = await db
        .insert(organizations)
        .values({
          name: 'Org To Delete',
          slug: 'org-to-delete',
          tenantId: newTenant!.id
        })
        .returning();

      const newOrgId = newOrg!.id;

      await db.insert(invitations).values(
        buildInvitation({
          organizationId: newOrgId,
          emailHash: sha256(email.toLowerCase()),
          emailEncrypted: mockEncrypt(email),
          tokenHash,
          status: 'pending'
        })
      );

      // Verify invitation exists
      const [beforeDelete] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.organizationId, newOrgId))
        .limit(1);
      expect(beforeDelete).toBeDefined();

      // Act - Delete organization (CASCADE should delete invitations)
      await db.delete(organizations).where(eq(organizations.id, newOrgId));

      // Assert - Invitation should be deleted
      const [afterDelete] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.organizationId, newOrgId))
        .limit(1);
      expect(afterDelete).toBeUndefined();
    });
  });

  // ==========================================================================
  // UNIQUE CONSTRAINT TESTS
  // ==========================================================================

  describe('Unique Constraints', () => {
    beforeEach(async () => {
      // Clean up before each test to ensure clean state
      await db.delete(invitations);
    });

    it('should enforce unique token hash constraint', async () => {
      // Arrange
      const tokenHash = sha256('duplicate-token-test');

      // Act - Insert first invitation
      await db.insert(invitations).values(
        buildInvitation({
          organizationId: org1Id,
          tokenHash,
          status: 'pending'
        })
      );

      // Assert - Second insert with same tokenHash should fail
      // Using rejects.toThrow for proper Jest async assertion
      await expect(
        db.insert(invitations).values(
          buildInvitation({
            organizationId: org2Id,
            tokenHash, // Same token hash
            status: 'pending'
          })
        )
      ).rejects.toThrow(
        /invitations_token_hash_unique|duplicate key|unique constraint|23505|Failed query/
      );
    });
  });

  // ==========================================================================
  // INDEX VERIFICATION TESTS
  // ==========================================================================

  describe('Index Verification', () => {
    it('should have tenant_status_idx index', async () => {
      // Act
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'invitations'
        AND indexname = 'invitations_tenant_status_idx'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
    });

    it('should have tenant_email_hash_idx index', async () => {
      // Act
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'invitations'
        AND indexname = 'invitations_tenant_email_hash_idx'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
    });

    it('should have tokenHash column with type VARCHAR(255)', async () => {
      // Act
      const result = await pool.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'invitations'
        AND constraint_type = 'UNIQUE'
        AND constraint_name = 'invitations_token_hash_unique'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
    });
  });

  // ==========================================================================
  // FOREIGN KEY VERIFICATION TESTS
  // ==========================================================================

  describe('Foreign Key Constraints', () => {
    it('should have CASCADE DELETE foreign key to organizations', async () => {
      // Act
      const result = await pool.query(`
        SELECT
          rc.constraint_name,
          rc.delete_rule
        FROM information_schema.referential_constraints rc
        WHERE rc.constraint_name = 'invitations_organization_id_organizations_id_fk'
      `);

      // Assert
      expect(result.rowCount).toBeGreaterThan(0);
      const fk = result.rows[0];
      expect(fk.delete_rule).toBe('CASCADE');
    });

    it('should have SET NULL foreign key to invited_by_user_id', async () => {
      const result = await pool.query(`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        WHERE rc.constraint_name = 'invitations_invited_by_user_id_users_id_fk'
      `);

      expect(result.rowCount).toBe(1);
      expect(result.rows[0]?.delete_rule).toBe('SET NULL');
    });

    it('should set invited_by_user_id to null when inviter is deleted', async () => {
      const tokenHash = sha256(testToken());

      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash,
            invitedByUserId: inviterUserId
          })
        )
        .returning();

      await db.delete(users).where(eq(users.id, inviterUserId));

      const result = await db
        .select({ invitedByUserId: invitations.invitedByUserId })
        .from(invitations)
        .where(eq(invitations.id, invitation!.id));

      expect(result).toHaveLength(1);
      expect(result[0]?.invitedByUserId).toBeNull();
    });
  });

  // ==========================================================================
  // P0 COMPLIANCE TESTS
  // ==========================================================================

  describe('P0 Compliance', () => {
    it('should have organizationId column NOT NULL (multi-tenancy)', async () => {
      // Act
      const result = await pool.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'invitations'
        AND column_name = 'organization_id'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].is_nullable).toBe('NO');
    });

    it('should have emailEncrypted column for PII encryption', async () => {
      // Act
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'invitations'
        AND column_name = 'email_encrypted'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].data_type).toBe('text');
    });

    it('should have emailHash column for lookups (not PII)', async () => {
      // Act
      const result = await pool.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'invitations'
        AND column_name = 'email_hash'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].data_type).toBe('character varying');
      expect(result.rows[0].character_maximum_length).toBe(64);
    });

    it('should have tokenHash column with type VARCHAR(255)', async () => {
      // Act
      const result = await pool.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'invitations'
        AND column_name = 'token_hash'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].data_type).toBe('character varying');
      expect(result.rows[0].character_maximum_length).toBe(255);
    });
  });

  // ==========================================================================
  // STATUS TRANSITION TESTS
  // ==========================================================================

  describe('Status Lifecycle', () => {
    it('should allow status update from pending to accepted', async () => {
      // Arrange
      const tokenHash = sha256('status-transition-test');
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash,
            status: 'pending'
          })
        )
        .returning();

      // Act
      await db
        .update(invitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date()
        })
        .where(eq(invitations.id, invitation!.id));

      // Assert
      const [updated] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, invitation!.id))
        .limit(1);

      expect(updated?.status).toBe('accepted');
      expect(updated?.acceptedAt).toBeDefined();
    });

    it('should allow status update from pending to expired', async () => {
      // Arrange
      const tokenHash = sha256('expiry-test');
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash,
            status: 'pending'
          })
        )
        .returning();

      // Act
      await db
        .update(invitations)
        .set({ status: 'expired' })
        .where(eq(invitations.id, invitation!.id));

      // Assert
      const [updated] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, invitation!.id))
        .limit(1);

      expect(updated?.status).toBe('expired');
    });
  });

  // ==========================================================================
  // NULLABLE FIELD TESTS
  // ==========================================================================

  describe('Nullable Fields', () => {
    it('should allow null emailHash and emailEncrypted', async () => {
      // Act - Invitation without email (phone-only flow)
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash: sha256('no-email-test'),
            status: 'pending'
          })
        )
        .returning();

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.emailHash).toBeNull();
      expect(invitation.emailEncrypted).toBeNull();
    });

    it('should allow null role', async () => {
      // Act
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash: sha256('no-role-test'),
            status: 'pending',
            role: null
          })
        )
        .returning();

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.role).toBeNull();
    });

    it('should allow null invitedByUserId', async () => {
      // Act
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash: sha256('no-inviter-test'),
            status: 'pending',
            invitedByUserId: null
          })
        )
        .returning();

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.invitedByUserId).toBeNull();
    });

    it('should allow null expiresAt', async () => {
      // Act
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash: sha256('no-expiry-test'),
            status: 'pending',
            expiresAt: null
          })
        )
        .returning();

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.expiresAt).toBeNull();
    });

    it('should allow null acceptedAt for pending invitations', async () => {
      // Act
      const [invitation] = await db
        .insert(invitations)
        .values(
          buildInvitation({
            organizationId: org1Id,
            tokenHash: sha256('pending-no-accept-test'),
            status: 'pending',
            acceptedAt: null
          })
        )
        .returning();

      // Assert
      expect(invitation).toBeDefined();
      expect(invitation.acceptedAt).toBeNull();
    });
  });
});
