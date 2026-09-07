import {
  emailMessages,
  emailProviderMessages,
  emailWebhookEvents,
  eq,
  userRoles
} from '@package/db-core';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { createUserFixture, deleteUserFixture } from '../../fixtures/user.fixture';
import { startTestServer } from '../../helpers/bootstrap';
import {
  createTestOrganization,
  createTestUserTenant,
  setupE2ETestDatabaseJest
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('Email Webhook Operations E2E', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let organizationId: number;
  let tenantDbId: number;
  let tenantHeader: string;
  let testUserId: number;
  let jwtToken: string;
  let webhookEventId: number;
  let emailMessageId: number;
  let emailProviderMessageId: number;
  let unmatchedWebhookEventId: number;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);

    const { tenantId, organizationId: orgId } = await createTestOrganization(server.app);
    tenantDbId = tenantId;
    organizationId = orgId;
    tenantHeader = String(organizationId);

    const testUser = await createUserFixture(server.app, { organizationId });
    testUserId = testUser.id;
    await createTestUserTenant(server.app, testUserId, tenantDbId, 'tenant_admin', true);
    await db.insert(userRoles).values({
      userId: testUserId,
      role: 'system_owner'
    });

    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = server.app.get(JwtService);
    jwtToken = jwtService.sign({
      sub: String(testUserId),
      db_user_id: String(testUserId),
      tenant_id: String(tenantDbId),
      actor_id: String(testUserId),
      roles: ['system_owner'],
      permissions: ['system:system:monitor', 'system:system:settings'],
      expiresIn: '7d'
    });

    const [message] = await db
      .insert(emailMessages)
      .values({
        organizationId,
        direction: 'outbound',
        status: 'delivered',
        referenceType: 'invitation',
        referenceId: 'invite-phase2-e2e',
        subject: 'Invitation to Email Ops Org',
        correlationId: 'corr-phase2-e2e',
        acceptedAt: new Date('2026-03-17T10:00:00.000Z'),
        deliveredAt: new Date('2026-03-17T10:01:00.000Z')
      })
      .returning({ id: emailMessages.id });

    if (!message) {
      throw new Error('Failed to seed email message');
    }

    emailMessageId = message.id;

    const [providerMessage] = await db
      .insert(emailProviderMessages)
      .values({
        organizationId,
        emailMessageId,
        provider: 'resend',
        attemptNumber: 1,
        providerMessageId: 'msg-phase2-e2e',
        providerDeliveryId: 'delivery-phase2-e2e',
        providerEventId: 'event-phase2-e2e',
        providerStatus: 'delivered',
        normalizedStatus: 'delivered',
        correlationId: 'corr-phase2-e2e',
        acceptedAt: new Date('2026-03-17T10:00:00.000Z'),
        lastWebhookOccurredAt: new Date('2026-03-17T10:01:00.000Z'),
        lastWebhookAt: new Date('2026-03-17T10:01:01.000Z')
      })
      .returning({ id: emailProviderMessages.id });

    if (!providerMessage) {
      throw new Error('Failed to seed email provider message');
    }

    emailProviderMessageId = providerMessage.id;

    const [event] = await db
      .insert(emailWebhookEvents)
      .values({
        organizationId,
        emailMessageId,
        emailProviderMessageId,
        provider: 'resend',
        dedupeKey: `resend:delivery:e2e-${Date.now()}`,
        providerMessageId: 'msg-phase2-e2e',
        providerDeliveryId: 'delivery-phase2-e2e',
        providerEventId: 'event-phase2-e2e',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'unmatched',
        attemptCount: 1,
        occurredAt: new Date('2026-03-17T10:01:00.000Z'),
        rawBody: Buffer.from('{"type":"email.delivered"}'),
        rawPayloadJson: { type: 'email.delivered' },
        contentType: 'application/json',
        receivedAt: new Date('2026-03-17T10:01:01.000Z'),
        processedAt: new Date('2026-03-17T10:01:02.000Z'),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning({ id: emailWebhookEvents.id });

    if (!event) {
      throw new Error('Failed to seed email webhook event');
    }

    webhookEventId = event.id;

    const [unmatchedEvent] = await db
      .insert(emailWebhookEvents)
      .values({
        organizationId: null,
        emailMessageId: null,
        emailProviderMessageId: null,
        provider: 'resend',
        dedupeKey: `resend:delivery:unmatched-${Date.now()}`,
        providerMessageId: 'msg-unmatched-phase5-e2e',
        providerDeliveryId: 'delivery-unmatched-phase5-e2e',
        providerEventId: 'event-unmatched-phase5-e2e',
        providerEventType: 'email.opened',
        normalizedEventType: 'opened',
        verificationStatus: 'verified',
        processingStatus: 'unmatched',
        attemptCount: 1,
        occurredAt: null,
        rawBody: Buffer.from('{"type":"email.opened"}'),
        rawPayloadJson: { type: 'email.opened' },
        contentType: 'application/json',
        receivedAt: new Date('2026-03-17T10:05:01.000Z'),
        processedAt: new Date('2026-03-17T10:05:02.000Z'),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning({ id: emailWebhookEvents.id });

    if (!unmatchedEvent) {
      throw new Error('Failed to seed unmatched email webhook event');
    }

    unmatchedWebhookEventId = unmatchedEvent.id;
  });

  afterAll(async () => {
    if (unmatchedWebhookEventId) {
      await db.delete(emailWebhookEvents).where(eq(emailWebhookEvents.id, unmatchedWebhookEventId));
    }
    if (webhookEventId) {
      await db.delete(emailWebhookEvents).where(eq(emailWebhookEvents.id, webhookEventId));
    }
    if (emailProviderMessageId) {
      await db
        .delete(emailProviderMessages)
        .where(eq(emailProviderMessages.id, emailProviderMessageId));
    }
    if (emailMessageId) {
      await db.delete(emailMessages).where(eq(emailMessages.id, emailMessageId));
    }
    if (testUserId) {
      await db.delete(userRoles).where(eq(userRoles.userId, testUserId));
      await deleteUserFixture(server.app, organizationId, testUserId);
    }
    await server?.close();
  });

  it('requires authentication for system email webhook operations', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/inbound-mail/summary',
      headers: {
        'x-tenant-id': tenantHeader
      }
    });

    expect(response.status).toBe(401);
  });

  it('returns the email webhook summary for authorized operators', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/inbound-mail/summary',
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'x-tenant-id': tenantHeader
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.totalEvents).toBeGreaterThanOrEqual(1);
    expect(response.body.data?.retryableEvents).toBeGreaterThanOrEqual(1);
  });

  it('lists persisted email webhook events for authorized operators', async () => {
    const response = await server.request({
      method: 'GET',
      url:
        `/v1/console/email-webhooks?processingStatus=unmatched&organizationId=${organizationId}` +
        '&verificationStatus=verified&providerMessageId=msg-phase2-e2e' +
        '&providerDeliveryId=delivery-phase2-e2e&providerEventId=event-phase2-e2e' +
        `&emailMessageId=${emailMessageId}&dateFrom=2026-03-17T00:00:00.000Z&dateTo=2026-03-18T00:00:00.000Z`,
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'x-tenant-id': tenantHeader
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: webhookEventId,
          provider: 'resend',
          organizationId,
          emailMessageId,
          emailProviderMessageId,
          organizationName: expect.any(String),
          messageStatus: 'delivered',
          latestProviderStatus: 'delivered',
          referenceType: 'invitation',
          referenceId: 'invite-phase2-e2e'
        })
      ])
    );
  });

  it('keeps unmatched null-organization webhook rows searchable by provider identifiers', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/email-webhooks?processingStatus=unmatched&providerMessageId=msg-unmatched-phase5-e2e',
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'x-tenant-id': tenantHeader
      }
    });

    expect(response.status).toBe(200);
    const unmatchedItem = response.body.data?.items.find(
      (item: { id: number }) => item.id === unmatchedWebhookEventId
    );

    expect(unmatchedItem).toEqual(
      expect.objectContaining({
        id: unmatchedWebhookEventId,
        providerMessageId: 'msg-unmatched-phase5-e2e',
        providerEventType: 'email.opened',
        processingStatus: 'unmatched'
      })
    );
    expect(unmatchedItem).not.toHaveProperty('organizationId');
    expect(unmatchedItem).not.toHaveProperty('organizationName');
    expect(unmatchedItem).not.toHaveProperty('emailMessageId');
    expect(unmatchedItem).not.toHaveProperty('messageStatus');
    expect(unmatchedItem).not.toHaveProperty('latestProviderStatus');
  });

  it('reprocesses a persisted unmatched webhook event into an applied state', async () => {
    const response = await server.request({
      method: 'POST',
      url: `/v1/console/inbound-mail/${webhookEventId}/reprocess`,
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'x-tenant-id': tenantHeader
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        webhookEventId,
        processingStatus: 'applied',
        attemptCount: 2,
        reprocessed: true
      })
    );
  });
});
