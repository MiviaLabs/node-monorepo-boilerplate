import 'reflect-metadata';
import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AUTH_PROVIDER_FACTORY, type AuthProviderFactory } from '@package/auth';
import {
  and,
  eq,
  organizations,
  tenants,
  userIdentities,
  userRoles,
  userTenants,
  users,
  type NodePgDatabase
} from '@package/db-core';
import { EncryptionService } from '@package/encryption';

import {
  buildUsageText,
  ensureSeedAllowed,
  parseSeedSystemUserArgs
} from './seed-system-user.helpers';
import { AppModule } from '../src/app.module';
import { MAIN_DB } from '../src/common/database/database.constants';
import { UserIdentityRepository } from '../src/modules/auth/repositories/user-identity.repository';
import { EncryptedStoreKeyService } from '../src/modules/encrypted-store/encrypted-store-key.service';

interface FirebaseAuthLike {
  getUserByEmail: (email: string) => Promise<{ uid: string }>;
  createUser: (data: Record<string, unknown>) => Promise<{ uid: string }>;
  updateUser: (uid: string, data: Record<string, unknown>) => Promise<{ uid: string }>;
  setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
}

interface FirebaseTenantManagerLike {
  createTenant: (
    config: Record<string, unknown>
  ) => Promise<{ tenantId: string; displayName: string }>;
  authForTenant: (tenantId: string) => FirebaseAuthLike;
}

interface GoogleIdentityProviderLike {
  type: string;
  firebaseAuth: {
    tenantManager: () => FirebaseTenantManagerLike;
  };
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function buildPermissionVersion(roles: string[]): string {
  const normalized = [...roles].sort().join('|');
  const hash = createHash('sha256').update(normalized).digest('base64').slice(0, 16);
  return `v${hash}`;
}

function buildClaims(userId: number, organizationId: number): Record<string, unknown> {
  const roles = ['system_owner', 'tenant_owner'];
  return {
    tenant_id: String(organizationId),
    organization_id: String(organizationId),
    db_user_id: String(userId),
    roles,
    perm_version: buildPermissionVersion(roles)
  };
}

async function encryptToEnvelope(
  encryptionService: EncryptionService,
  encryptedStoreKeyService: EncryptedStoreKeyService,
  plaintext: string
): Promise<{ envelope: string; keyVersion: string }> {
  const { keyId, keyVersion } = await encryptedStoreKeyService.getPrimaryKeyIdWithVersion();
  const result = await encryptionService.encryptToBase64(plaintext, { keyId });
  return {
    envelope: `${result.ciphertext}:${result.encryptedDataKey}:${result.iv}:${result.authTag}`,
    keyVersion
  };
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(buildUsageText());
    return;
  }

  const options = parseSeedSystemUserArgs(process.argv.slice(2));
  ensureSeedAllowed(process.env['NODE_ENV'], options.allowProduction);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log']
  });

  try {
    const db = app.get<NodePgDatabase>(MAIN_DB);
    const logger = new Logger('SeedSystemUserScript');
    const encryptionService = app.get(EncryptionService);
    const encryptedStoreKeyService = app.get(EncryptedStoreKeyService);
    const identityRepository = app.get(UserIdentityRepository);
    const authProviderFactory = app.get<AuthProviderFactory>(AUTH_PROVIDER_FACTORY);
    const provider = authProviderFactory.getDefaultProvider();

    if (
      provider?.type !== 'google-identity-platform' ||
      !('firebaseAuth' in provider) ||
      !provider.firebaseAuth
    ) {
      throw new Error(
        'This script currently requires the default auth provider to be Google Identity Platform.'
      );
    }

    const googleProvider = provider as unknown as GoogleIdentityProviderLike;

    await db.transaction(async (tx) => {
      const [existingOrganizationRecord] = await tx
        .select({
          organization: organizations,
          tenant: tenants
        })
        .from(organizations)
        .innerJoin(tenants, eq(organizations.tenantId, tenants.id))
        .where(eq(organizations.slug, options.organizationSlug))
        .limit(1);

      let organizationRecord = existingOrganizationRecord
        ? {
            ...existingOrganizationRecord.organization,
            tenant: existingOrganizationRecord.tenant
          }
        : null;

      if (!organizationRecord) {
        const [tenantRecord] = await tx
          .insert(tenants)
          .values({
            type: 'organization',
            status: 'active'
          })
          .returning();

        if (!tenantRecord) {
          throw new Error('Failed to create tenant');
        }

        const [createdOrganization] = await tx
          .insert(organizations)
          .values({
            tenantId: tenantRecord.id,
            name: options.organizationName,
            displayName: options.organizationDisplayName,
            slug: options.organizationSlug,
            isActive: true
          })
          .returning();

        if (!createdOrganization) {
          throw new Error('Failed to create organization');
        }

        organizationRecord = {
          ...createdOrganization,
          tenant: tenantRecord
        };
        logger.log(`Created organization ${options.organizationSlug} (${createdOrganization.id})`);
      } else if (!organizationRecord.isActive) {
        await tx
          .update(organizations)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(organizations.id, organizationRecord.id));
      }

      if (!organizationRecord) {
        throw new Error('Organization resolution failed');
      }

      if (!organizationRecord.gcpTenantId) {
        const tenantManager = googleProvider.firebaseAuth.tenantManager();
        const tenantResult = await tenantManager.createTenant({
          displayName: options.organizationDisplayName,
          emailSignInConfig: {
            enabled: true,
            passwordRequired: true
          }
        });

        const [updatedOrganization] = await tx
          .update(organizations)
          .set({
            gcpTenantId: tenantResult.tenantId,
            updatedAt: new Date()
          })
          .where(eq(organizations.id, organizationRecord.id))
          .returning();

        if (!updatedOrganization) {
          throw new Error('Failed to persist GCP tenant mapping');
        }

        organizationRecord = {
          ...updatedOrganization,
          tenant: organizationRecord.tenant
        };
        logger.log(
          `Provisioned GCP tenant ${tenantResult.tenantId} for organization ${organizationRecord.slug}`
        );
      }

      if (!organizationRecord.gcpTenantId) {
        throw new Error('Organization is missing gcpTenantId after provisioning');
      }

      const emailHash = hashEmail(options.email);
      const usersByEmail = await tx.select().from(users).where(eq(users.emailHash, emailHash));

      const existingUserInOtherOrganization = usersByEmail.find(
        (user) => user.organizationId !== organizationRecord.id
      );
      if (existingUserInOtherOrganization) {
        throw new Error(
          `Email ${options.email} already belongs to organization ${existingUserInOtherOrganization.organizationId}`
        );
      }

      const encryptedEmail = await encryptToEnvelope(
        encryptionService,
        encryptedStoreKeyService,
        options.email
      );
      const encryptedFirstName = options.firstName
        ? await encryptToEnvelope(encryptionService, encryptedStoreKeyService, options.firstName)
        : undefined;
      const encryptedLastName = options.lastName
        ? await encryptToEnvelope(encryptionService, encryptedStoreKeyService, options.lastName)
        : undefined;

      let userRecord =
        usersByEmail.find((user) => user.organizationId === organizationRecord.id) ?? null;

      if (!userRecord) {
        const [createdUser] = await tx
          .insert(users)
          .values({
            organizationId: organizationRecord.id,
            emailHash,
            emailEncrypted: encryptedEmail.envelope,
            firstNameEncrypted: encryptedFirstName?.envelope,
            lastNameEncrypted: encryptedLastName?.envelope,
            displayName: options.userDisplayName,
            encryptionKeyVersion: encryptedEmail.keyVersion,
            isActive: true,
            isVerified: true
          })
          .returning();

        if (!createdUser) {
          throw new Error('Failed to create system owner user');
        }

        userRecord = createdUser;
        logger.log(`Created DB user ${userRecord.id} for ${options.email}`);
      } else {
        const [updatedUser] = await tx
          .update(users)
          .set({
            emailHash,
            emailEncrypted: encryptedEmail.envelope,
            firstNameEncrypted: encryptedFirstName?.envelope ?? userRecord.firstNameEncrypted,
            lastNameEncrypted: encryptedLastName?.envelope ?? userRecord.lastNameEncrypted,
            displayName: options.userDisplayName,
            encryptionKeyVersion: encryptedEmail.keyVersion,
            isActive: true,
            isVerified: true,
            updatedAt: new Date()
          })
          .where(eq(users.id, userRecord.id))
          .returning();

        if (!updatedUser) {
          throw new Error('Failed to update system owner user');
        }

        userRecord = updatedUser;
      }

      await tx
        .update(userTenants)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(userTenants.userId, userRecord.id));

      await tx
        .insert(userTenants)
        .values({
          userId: userRecord.id,
          tenantId: organizationRecord.tenant.id,
          role: 'tenant_owner',
          isDefault: true,
          isActive: true
        })
        .onConflictDoUpdate({
          target: [userTenants.userId, userTenants.tenantId],
          set: {
            role: 'tenant_owner',
            isDefault: true,
            isActive: true,
            updatedAt: new Date()
          }
        });

      await tx
        .insert(userRoles)
        .values({
          userId: userRecord.id,
          role: 'system_owner'
        })
        .onConflictDoNothing();

      const tenantAuth = googleProvider.firebaseAuth
        .tenantManager()
        .authForTenant(organizationRecord.gcpTenantId);

      let providerUserUid: string;
      try {
        const providerUser = await tenantAuth.getUserByEmail(options.email);
        providerUserUid = providerUser.uid;
        await tenantAuth.updateUser(providerUserUid, {
          password: options.password,
          email: options.email,
          displayName: options.userDisplayName,
          emailVerified: true,
          disabled: false
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        if (!message.includes('no user record') && !message.includes('user-not-found')) {
          throw error;
        }

        const createdProviderUser = await tenantAuth.createUser({
          email: options.email,
          password: options.password,
          displayName: options.userDisplayName,
          emailVerified: true,
          disabled: false
        });
        providerUserUid = createdProviderUser.uid;
      }

      await tenantAuth.setCustomUserClaims(
        providerUserUid,
        buildClaims(userRecord.id, organizationRecord.id)
      );

      const [linkedIdentity] = await tx
        .select()
        .from(userIdentities)
        .where(
          and(
            eq(userIdentities.provider, 'email_password'),
            eq(userIdentities.providerUid, providerUserUid)
          )
        )
        .limit(1);

      if (linkedIdentity && linkedIdentity.userId !== userRecord.id) {
        throw new Error(
          `Provider UID ${providerUserUid} is already linked to another DB user (${linkedIdentity.userId})`
        );
      }

      const [primaryIdentityForUser] = await tx
        .select()
        .from(userIdentities)
        .where(
          and(
            eq(userIdentities.userId, userRecord.id),
            eq(userIdentities.provider, 'email_password')
          )
        )
        .limit(1);

      if (!primaryIdentityForUser) {
        await identityRepository.createWithTransaction(tx, {
          userId: userRecord.id,
          provider: 'email_password',
          providerUid: providerUserUid,
          providerEmail: options.email,
          displayName: options.userDisplayName,
          emailVerified: true,
          isPrimary: true
        });
      } else if (primaryIdentityForUser.providerUid !== providerUserUid) {
        await tx
          .update(userIdentities)
          .set({
            providerUid: providerUserUid,
            providerEmailHash: emailHash,
            providerEmailEncrypted: encryptedEmail.envelope,
            displayName: options.userDisplayName,
            emailVerified: true,
            isPrimary: true,
            updatedAt: new Date()
          })
          .where(eq(userIdentities.id, primaryIdentityForUser.id));
      } else {
        await tx
          .update(userIdentities)
          .set({
            providerEmailHash: emailHash,
            providerEmailEncrypted: encryptedEmail.envelope,
            displayName: options.userDisplayName,
            emailVerified: true,
            isPrimary: true,
            updatedAt: new Date()
          })
          .where(eq(userIdentities.id, primaryIdentityForUser.id));
      }

      await tx
        .update(organizations)
        .set({
          ownerId: userRecord.id,
          isActive: true,
          updatedAt: new Date()
        })
        .where(eq(organizations.id, organizationRecord.id));

      logger.log(
        `Seed complete: org=${organizationRecord.slug} orgId=${organizationRecord.id} tenantId=${organizationRecord.tenant.id} userId=${userRecord.id} gcpTenantId=${organizationRecord.gcpTenantId}`
      );
    });
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
