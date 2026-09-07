/**
 * Dead Letter Queue Test Helper
 *
 * Mock consumer and utilities for DLQ E2E testing.
 * Simulates transient and permanent error scenarios.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';

import { outbox, OutboxStatus } from '@package/db-outbox';
import { DeadLetterService, ErrorClassification, OutboxRepository } from '@package/events';
import { eq } from 'drizzle-orm';

import type { TestServer } from './bootstrap';
import type { MockEventConsumer } from './event-consumer.helper';
import type { INestApplication } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * DLQ test event data
 */
export interface DLQTestEventData {
  eventId: string;
  eventType: string;
  aggregateId: string;
  tenantId: string;
  payload: string;
  status: OutboxStatus;
  retryCount: number;
  deadLetteredAt?: Date;
  deadLetterReason?: ErrorClassification;
  errorMessage?: string;
}

/**
 * Create a dead-lettered event for testing
 */
export async function createDeadLetteredEvent(
  db: NodePgDatabase<Record<string, never>>,
  tenantId: string,
  options?: {
    eventType?: string;
    aggregateId?: string;
    deadLetterReason?: ErrorClassification;
    errorMessage?: string;
    retryCount?: number;
    age?: number; // Age in days (for cleanup tests)
  }
): Promise<DLQTestEventData> {
  const eventId = randomUUID();
  const age = options?.age ?? 0;

  const createdAt = age > 0 ? new Date(Date.now() - age * 24 * 60 * 60 * 1000) : new Date();

  const deadLetteredAt = age > 0 ? new Date(Date.now() - age * 24 * 60 * 60 * 1000) : new Date();

  await db
    .insert(outbox)
    .values({
      eventId,
      eventType: options?.eventType ?? 'test.event',
      aggregateId: options?.aggregateId ?? 'test-123',
      tenantId,
      payload: JSON.stringify({ test: true }),
      status: OutboxStatus.FAILED,
      retryCount: options?.retryCount ?? 5,
      deadLetteredAt,
      deadLetterReason: options?.deadLetterReason ?? ErrorClassification.NETWORK,
      errorMessage: options?.errorMessage ?? 'Test error',
      schemaVersion: '1.0',
      createdAt
    })
    .returning();

  return {
    eventId,
    eventType: options?.eventType ?? 'test.event',
    aggregateId: options?.aggregateId ?? 'test-123',
    tenantId,
    payload: JSON.stringify({ test: true }),
    status: OutboxStatus.FAILED,
    retryCount: options?.retryCount ?? 5,
    deadLetteredAt,
    deadLetterReason: options?.deadLetterReason ?? ErrorClassification.NETWORK,
    errorMessage: options?.errorMessage ?? 'Test error'
  };
}

/**
 * Create multiple dead-lettered events for testing
 */
export async function createMultipleDeadLetteredEvents(
  db: NodePgDatabase<Record<string, never>>,
  tenantId: string,
  count: number
): Promise<string[]> {
  const eventIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const eventData = await createDeadLetteredEvent(db, tenantId, {
      eventType: `test.event.${i}`,
      aggregateId: `test-${i}`,
      errorMessage: `Test error ${i}`
    });
    eventIds.push(eventData.eventId);
  }

  return eventIds;
}

/**
 * Cleanup dead-lettered events by tenant ID
 */
export async function cleanupDeadLetteredEvents(
  db: NodePgDatabase<Record<string, never>>,
  tenantId: string
): Promise<void> {
  await db.delete(outbox).where(eq(outbox.tenantId, tenantId));
}

/**
 * Verify DLQ event exists and has expected properties
 */
export function verifyDeadLetteredEvent(
  event: DLQTestEventData | null,
  expectations?: {
    eventType?: string;
    aggregateId?: string;
    deadLetterReason?: ErrorClassification;
    errorMessage?: string;
    retryCount?: number;
  }
): void {
  expect(event).not.toBeNull();

  if (expectations?.eventType) {
    expect(event?.eventType).toBe(expectations.eventType);
  }
  if (expectations?.aggregateId) {
    expect(event?.aggregateId).toBe(expectations.aggregateId);
  }
  if (expectations?.deadLetterReason) {
    expect(event?.deadLetterReason).toBe(expectations.deadLetterReason);
  }
  if (expectations?.errorMessage) {
    expect(event?.errorMessage).toBe(expectations.errorMessage);
  }
  if (expectations?.retryCount !== undefined) {
    expect(event?.retryCount).toBe(expectations.retryCount);
  }

  // Verify DLQ properties
  expect(event?.deadLetteredAt).not.toBeNull();
  expect(event?.status).toBe(OutboxStatus.FAILED);
}

/**
 * Test error classification for various error types
 */
export function testErrorClassification(deadLetterService: DeadLetterService): void {
  // Network errors
  const networkError = new Error('ECONNREFUSED: Connection refused');
  expect(deadLetterService.classifyError(networkError)).toBe(ErrorClassification.NETWORK);

  // Timeout errors
  const timeoutError = new Error('Request timeout after 30 seconds');
  expect(deadLetterService.classifyError(timeoutError)).toBe(ErrorClassification.TIMEOUT);

  // Validation errors
  const validationError = new Error('Validation failed: invalid schema format');
  expect(deadLetterService.classifyError(validationError)).toBe(ErrorClassification.VALIDATION);

  // Permission errors
  const permissionError = new Error('Unauthorized: insufficient permissions');
  expect(deadLetterService.classifyError(permissionError)).toBe(ErrorClassification.PERMISSION);

  // Unknown errors
  const unknownError = new Error('Some unexpected error');
  expect(deadLetterService.classifyError(unknownError)).toBe(ErrorClassification.UNKNOWN);
}

/**
 * Simulate retry loop with mock consumer
 */
export async function simulateRetryLoop(
  mockConsumer: MockEventConsumer,
  outboxRepo: OutboxRepository,
  eventId: string,
  maxAttempts = 5
): Promise<{ success: boolean; attemptCount: number }> {
  let attemptCount = 0;

  while (attemptCount < maxAttempts) {
    attemptCount++;

    try {
      // Mark as processing
      await outboxRepo.markAsProcessing(eventId, `worker-test-${attemptCount}`);

      // Try to consume
      await mockConsumer.consume();

      // Success - mark as published
      await outboxRepo.markAsPublished(eventId);
      return { success: true, attemptCount };
    } catch (error) {
      // Failure - mark as failed with retry
      const nextRetryAt = new Date(Date.now() + 1000); // 1 second retry delay
      await outboxRepo.markAsFailed(
        eventId,
        error instanceof Error ? error.message : String(error),
        nextRetryAt
      );
    }
  }

  return { success: false, attemptCount };
}

/**
 * DLQ Helper class for convenience
 */
export class DeadLetterHelper {
  constructor(
    private readonly app: INestApplication,
    _server: TestServer
  ) {}

  get db(): NodePgDatabase<Record<string, never>> {
    return this.app.get<NodePgDatabase<Record<string, never>>>('DATABASE_CONNECTION');
  }

  get deadLetterService(): DeadLetterService {
    return this.app.get<DeadLetterService>(DeadLetterService);
  }

  get outboxRepo(): OutboxRepository {
    return this.app.get<OutboxRepository>(OutboxRepository);
  }

  /**
   * Create a test dead-lettered event
   */
  async createDeadLetteredEvent(
    tenantId: string,
    options?: {
      eventType?: string;
      aggregateId?: string;
      deadLetterReason?: ErrorClassification;
      errorMessage?: string;
      retryCount?: number;
      age?: number;
    }
  ): Promise<DLQTestEventData> {
    return createDeadLetteredEvent(this.db, tenantId, options);
  }

  /**
   * Create multiple dead-lettered events
   */
  async createMultipleDeadLetteredEvents(tenantId: string, count: number): Promise<string[]> {
    return createMultipleDeadLetteredEvents(this.db, tenantId, count);
  }

  /**
   * Cleanup all events for a tenant
   */
  async cleanup(tenantId: string): Promise<void> {
    await cleanupDeadLetteredEvents(this.db, tenantId);
  }

  /**
   * Test error classification
   */
  testErrorClassification(): void {
    testErrorClassification(this.deadLetterService);
  }

  /**
   * Send event to DLQ
   */
  async sendToDeadLetter(eventId: string, error: Error): Promise<void> {
    const event = await this.outboxRepo.getById(eventId);
    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }
    await this.deadLetterService.sendToDeadLetter(event, error);
  }

  /**
   * Replay from dead letter
   */
  async replayFromDeadLetter(eventId: string): Promise<boolean> {
    return this.deadLetterService.replayFromDeadLetter(eventId);
  }

  /**
   * Get dead-lettered events for tenant
   */
  async getDeadLetteredEvents(tenantId?: string): Promise<unknown[]> {
    return this.deadLetterService.getDeadLetteredEvents(tenantId);
  }

  /**
   * Get dead letter count for tenant
   */
  async getDeadLetterCount(tenantId: string): Promise<number> {
    return this.outboxRepo.getDeadLetterCount(tenantId);
  }

  /**
   * Cleanup old dead letters
   */
  async cleanupDeadLetters(cutoffDate: Date, tenantId: string): Promise<void> {
    await this.outboxRepo.cleanupDeadLetters(cutoffDate, tenantId);
  }
}

export function createDeadLetterHelper(
  app: INestApplication,
  server: TestServer
): DeadLetterHelper {
  return new DeadLetterHelper(app, server);
}
