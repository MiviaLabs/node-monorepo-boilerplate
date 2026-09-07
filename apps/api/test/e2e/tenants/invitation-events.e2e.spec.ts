/**
 * Tenant Invitation Events E2E Tests
 *
 * Validates end-to-end invitation event flow:
 * API invite command -> outbox publish -> Kafka consume -> invitation consumer execution.
 *
 * @packageDocumentation
 */

import * as crypto from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { userRoles, users } from '@package/db-core';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { TrackedEmailService } from '../../../src/modules/email-tracking/services/tracked-email.service';
import {
  startTestServer,
  waitForServiceInitialization,
  type TestServer
} from '../../helpers/bootstrap';
import {
  cleanupTenant,
  createTestOrganizationWithTenant,
  createTestUserTenant,
  setupE2ETestDatabaseJest,
  TEST_USER_ENCRYPTION_KEY_VERSION
} from '../../helpers/database';

import type {
  SendTrackedEmailInput,
  SendTrackedEmailResult
} from '../../../src/modules/email-tracking/services/tracked-email.service';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type SendTrackedEmailFn = (input: SendTrackedEmailInput) => Promise<SendTrackedEmailResult>;

function getSingleResult<T>(result: T | T[]): T {
  return Array.isArray(result) ? result[0]! : result;
}

async function waitForCall(
  spy: jest.SpyInstance<ReturnType<SendTrackedEmailFn>, Parameters<SendTrackedEmailFn>>,
  predicate: (input: SendTrackedEmailInput) => boolean,
  timeoutMs = 45000,
  intervalMs = 250
): Promise<SendTrackedEmailInput> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    for (const call of spy.mock.calls) {
      const request = call[0];
      if (request && predicate(request)) {
        return request;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for invitation consumer tracked email call after ${timeoutMs}ms`
  );
}

describe('Tenant Invitation Event Flow (E2E)', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let jwtService: JwtService;
  let tenantId: number;
  let organizationId: number;
  let userId: number;
  let authToken: string;
  let kafkaSetupCompleted = false;
  let previousEventsEnabled: string | undefined;
  let previousEmailProvider: string | undefined;
  let previousDefaultFromEmail: string | undefined;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();

    const { setupKafkaE2E: setupKafka } = await import('@package/test-utils');
    await setupKafka();
    kafkaSetupCompleted = true;

    previousEventsEnabled = process.env['EVENTS_ENABLED'];
    previousEmailProvider = process.env['EMAIL_PROVIDER'];
    previousDefaultFromEmail = process.env['DEFAULT_FROM_EMAIL'];
    process.env['EVENTS_ENABLED'] = 'true';
    process.env['EMAIL_PROVIDER'] = 'mock';
    process.env['DEFAULT_FROM_EMAIL'] = 'noreply@example.com';

    server = await startTestServer();
    await waitForServiceInitialization(server, { maxWait: 60000 });

    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    jwtService = server.app.get(JwtService);

    const orgResult = await createTestOrganizationWithTenant(server, 'Invitation Events Org');
    tenantId = orgResult.tenantId;
    organizationId = orgResult.organizationId;

    const emailHash = crypto
      .createHash('sha256')
      .update(`invitation-owner-${Date.now()}@example.com`)
      .digest('hex');

    const user = getSingleResult(
      await db
        .insert(users)
        .values({
          organizationId,
          emailHash,
          encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
          isActive: true,
          isVerified: true
        })
        .returning()
    );

    userId = Number(user.id);

    await createTestUserTenant(server, userId, tenantId, 'tenant_owner', true);
    await db.insert(userRoles).values({
      userId,
      role: 'system_owner'
    });

    authToken = jwtService.sign({
      sub: String(userId),
      db_user_id: String(userId),
      tenant_id: String(tenantId),
      actor_id: String(userId),
      roles: ['system_owner'],
      permissions: ['*']
    });
  }, 180000);

  afterAll(async () => {
    try {
      if (server?.app && tenantId) {
        await cleanupTenant(server.app, tenantId);
      }
    } finally {
      await server?.close();
      if (kafkaSetupCompleted) {
        const { teardownKafkaE2E: teardownKafka } = await import('@package/test-utils');
        await teardownKafka();
      }
      if (previousEventsEnabled === undefined) {
        delete process.env['EVENTS_ENABLED'];
      } else {
        process.env['EVENTS_ENABLED'] = previousEventsEnabled;
      }
      if (previousEmailProvider === undefined) {
        delete process.env['EMAIL_PROVIDER'];
      } else {
        process.env['EMAIL_PROVIDER'] = previousEmailProvider;
      }
      if (previousDefaultFromEmail === undefined) {
        delete process.env['DEFAULT_FROM_EMAIL'];
      } else {
        process.env['DEFAULT_FROM_EMAIL'] = previousDefaultFromEmail;
      }
    }
  }, 30000);

  it('should register consumer and process tenant.member.invited by calling TrackedEmailService', async () => {
    const trackedEmailService = server.app.get<TrackedEmailService>(TrackedEmailService);
    const sendTrackedEmailSpy = jest.spyOn(trackedEmailService, 'sendTrackedEmail');
    try {
      const inviteEmail = `invite-kafka-${Date.now()}@example.com`;

      const response = await server.httpPost({
        path: '/v1/workspaces/members/invite',
        tenantId: String(tenantId),
        body: {
          email: inviteEmail,
          roles: ['tenant_user']
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(201);

      const trackedEmailCall = await waitForCall(
        sendTrackedEmailSpy,
        (input) => input.request.to === inviteEmail,
        45000,
        250
      );

      expect(trackedEmailCall.organizationId).toBe(tenantId);
      expect(trackedEmailCall.request.subject).toBe(
        'You are invited to join Invitation Events Org'
      );
      expect(trackedEmailCall.request.html).toContain('/invitations/accept?tenantId=');
      expect(trackedEmailCall.request.html).toContain(`tenantId=${tenantId}`);
    } finally {
      sendTrackedEmailSpy.mockRestore();
    }
  }, 60000);
});
