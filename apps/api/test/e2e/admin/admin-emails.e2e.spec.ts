import { JwtService } from '@nestjs/jwt';
import {
  emailMessages,
  emailProviderMessages,
  emailWebhookEvents,
  eq,
  userRoles,
  type NodePgDatabase
} from '@package/db-core';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { createUserWithTenantFixture, UserRole } from '../../fixtures/user.fixture';
import { startTestServer } from '../../helpers/bootstrap';
import {
  cleanupOrganization,
  createTestOrganization,
  setupE2ETestDatabaseJest
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';

describe('Admin Emails E2E', () => {
  let server: TestServer;
  let db: NodePgDatabase;
  let jwtService: JwtService;
  let organizationId: number;
  let tenantId: number;
  let adminUserId: number;
  let adminToken: string;
  let emailMessageId: number;
  let secondOrganizationId: number;
  let secondEmailMessageId: number;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    db = server.app.get<NodePgDatabase>(MAIN_DB);
    jwtService = server.app.get<JwtService>(JwtService);

    const org = await createTestOrganization(server.app, 'Admin Email Ops Org');
    tenantId = org.tenantId;
    organizationId = org.organizationId;

    const adminUser = await createUserWithTenantFixture(server.app, {
      tenantId,
      organizationId,
      role: UserRole.USER,
      isDefault: true
    });
    adminUserId = adminUser.id;

    await db.insert(userRoles).values({
      userId: adminUserId,
      role: 'system_admin'
    });

    adminToken = jwtService.sign({
      sub: String(adminUserId),
      db_user_id: String(adminUserId),
      actor_id: String(adminUserId),
      tenant_id: String(organizationId),
      roles: ['system_admin', 'tenant_user'],
      permissions: ['system:system:monitor']
    });

    const [message] = await db
      .insert(emailMessages)
      .values({
        organizationId,
        direction: 'outbound',
        status: 'delivered',
        referenceType: 'invitation',
        referenceId: 'invite-e2e-1',
        subject: 'Invitation to Admin Email Ops Org',
        metadata: {
          templateKey: 'tenant.invitation',
          tags: ['tenant', 'invitation']
        },
        correlationId: 'corr-admin-email-e2e',
        acceptedAt: new Date('2026-03-17T09:58:00.000Z'),
        deliveredAt: new Date('2026-03-17T09:59:00.000Z')
      })
      .returning({ id: emailMessages.id });

    if (!message) {
      throw new Error('Failed to seed email message');
    }

    emailMessageId = message.id;

    await db.insert(emailProviderMessages).values({
      organizationId,
      emailMessageId,
      provider: 'resend',
      attemptNumber: 1,
      providerMessageId: 'msg-admin-e2e',
      providerDeliveryId: 'delivery-admin-e2e',
      providerEventId: 'event-admin-e2e',
      providerStatus: 'delivered',
      normalizedStatus: 'delivered',
      correlationId: 'corr-admin-email-e2e',
      acceptedAt: new Date('2026-03-17T09:58:00.000Z'),
      lastWebhookOccurredAt: new Date('2026-03-17T09:59:01.000Z'),
      lastWebhookAt: new Date('2026-03-17T09:59:02.000Z')
    });

    const [retryAttempt] = await db
      .insert(emailProviderMessages)
      .values({
        organizationId,
        emailMessageId,
        provider: 'resend',
        attemptNumber: 2,
        providerMessageId: 'msg-admin-e2e-retry',
        providerDeliveryId: 'delivery-admin-e2e-retry',
        providerEventId: 'event-admin-e2e-retry',
        providerStatus: 'accepted',
        normalizedStatus: 'accepted',
        correlationId: 'corr-admin-email-e2e-retry',
        acceptedAt: new Date('2026-03-17T10:05:00.000Z'),
        lastWebhookOccurredAt: null,
        lastWebhookAt: null
      })
      .returning({ id: emailProviderMessages.id });

    if (!retryAttempt) {
      throw new Error('Failed to seed retry provider message');
    }

    await db.insert(emailWebhookEvents).values({
      organizationId,
      emailMessageId,
      provider: 'resend',
      dedupeKey: `resend:delivery:admin-e2e-${Date.now()}`,
      providerMessageId: 'msg-admin-e2e',
      providerDeliveryId: 'delivery-admin-e2e',
      providerEventId: 'event-admin-e2e',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied',
      attemptCount: 1,
      rawBody: Buffer.from('{"type":"email.delivered"}'),
      rawPayloadJson: { type: 'email.delivered' },
      contentType: 'application/json',
      occurredAt: new Date('2026-03-17T09:59:01.000Z'),
      receivedAt: new Date('2026-03-17T09:59:02.000Z'),
      processedAt: new Date('2026-03-17T09:59:03.000Z')
    });

    const secondOrg = await createTestOrganization(server.app, 'Admin Email Ops Org Two');
    secondOrganizationId = secondOrg.organizationId;

    const [secondMessage] = await db
      .insert(emailMessages)
      .values({
        organizationId: secondOrganizationId,
        direction: 'outbound',
        status: 'failed',
        referenceType: 'reset',
        referenceId: 'reset-e2e-2',
        subject: 'Second organization delivery issue',
        correlationId: 'corr-admin-email-e2e-two'
      })
      .returning({ id: emailMessages.id });

    if (!secondMessage) {
      throw new Error('Failed to seed second organization email message');
    }

    secondEmailMessageId = secondMessage.id;
  });

  afterAll(async () => {
    if (secondOrganizationId) {
      await cleanupOrganization(server.app, secondOrganizationId);
    }
    if (adminUserId) {
      await db.delete(userRoles).where(eq(userRoles.userId, adminUserId));
    }
    if (organizationId) {
      await cleanupOrganization(server.app, organizationId);
    }
    await server?.close();
  });

  it('requires authentication for admin email routes', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/mail/summary',
      headers: {
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(401);
  });

  it('returns the admin email summary for authorized operators', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/mail/summary',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.summary).toEqual(
      expect.objectContaining({
        total: 2,
        delivered: 1,
        failedOrBouncedOrComplained: 1
      })
    );
  });

  it('returns the admin email inventory for authorized operators', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/emails?organizationId=' + organizationId,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailMessageId,
          provider: 'resend',
          providerMessageId: 'msg-admin-e2e-retry',
          messageStatus: 'delivered'
        })
      ])
    );
  });

  it('keeps organization filters scoped when mixed-tenant email data exists', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/emails?organizationId=' + organizationId,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.items).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          emailMessageId: secondEmailMessageId,
          organizationId: secondOrganizationId
        })
      ])
    );
  });

  it('returns the admin email detail for authorized operators', async () => {
    const response = await server.request({
      method: 'GET',
      url: `/v1/console/mail/${emailMessageId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({
          emailMessageId,
          providerMessageId: 'msg-admin-e2e-retry',
          messageStatus: 'delivered'
        }),
        providerAttempts: [
          expect.objectContaining({
            providerMessageId: 'msg-admin-e2e-retry',
            attemptNumber: 2,
            providerStatus: 'accepted'
          }),
          expect.objectContaining({
            providerMessageId: 'msg-admin-e2e',
            attemptNumber: 1,
            providerStatus: 'delivered'
          })
        ],
        relatedWebhookEvents: expect.arrayContaining([
          expect.objectContaining({
            providerEventType: 'email.delivered',
            processingStatus: 'applied'
          })
        ])
      })
    );
  });
});
