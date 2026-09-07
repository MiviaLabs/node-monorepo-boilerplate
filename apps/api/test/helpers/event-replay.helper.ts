/**
 * Event Replay Test Helper
 *
 * Utilities for testing event replay functionality.
 * Provides polling and waiting for replay completion.
 *
 * @packageDocumentation
 */

import { ReplayStatus } from '@package/events';

import type { INestApplication } from '@nestjs/common';

interface TestResponse {
  status: number;
  body: unknown;
}

interface TestServer {
  app: INestApplication;
  request: (options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }) => Promise<TestResponse>;
  close: () => Promise<void>;
}

/**
 * Extended response interface with data property for type-safe test code
 * Note: The actual response has `body` property, but tests use `data` for consistency
 */
interface TestResponseWithData<T> extends TestResponse {
  data: T;
}

interface ApiEnvelope<T> {
  data?: T;
}

function extractResponseData<T>(body: unknown): T | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const maybeEnvelope = body as ApiEnvelope<T>;
  if ('data' in maybeEnvelope) {
    return maybeEnvelope.data;
  }

  return body as T;
}

/**
 * Poll for replay completion with timeout
 */
export interface WaitForReplayOptions {
  maxWait?: number;
  interval?: number;
}

/**
 * Poll for replay completion with timeout
 *
 * Waits for replay to reach a terminal status (completed, failed, or cancelled).
 * Returns final status and session data.
 */
export async function waitForReplayCompletion(
  server: TestServer,
  replayId: string,
  jwtToken: string,
  tenantIdString: string,
  options: WaitForReplayOptions = {}
): Promise<{ status: ReplayStatus; session: ReplayStatusResponse }> {
  const { maxWait = 30000, interval = 500 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    const statusResponse = await server.request({
      method: 'GET',
      url: `/v1/platform/event-replay/${replayId}`,
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'x-tenant-id': tenantIdString
      }
    });

    if (statusResponse.status === 200) {
      const session = extractResponseData<ReplayStatusResponse>(statusResponse.body);
      if (!session) {
        continue;
      }

      // Check if terminal status reached
      if (
        session.status === ReplayStatus.COMPLETED ||
        session.status === ReplayStatus.FAILED ||
        session.status === ReplayStatus.CANCELLED
      ) {
        return { status: session.status, session };
      }
    }
  }

  throw new Error(`Replay ${replayId} timed out after ${maxWait}ms`);
}

/**
 * Replay status response (from API)
 */
export interface ReplayStatusResponse {
  replayId: string;
  status: ReplayStatus;
  processedCount: number;
  totalCount: number;
  successCount: number;
  failureCount: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

/**
 * Replay helper class
 *
 * Encapsulates replay test utilities for cleaner test code.
 */
export class EventReplayHelper {
  constructor(
    private readonly server: TestServer,
    private readonly jwtToken: string,
    private readonly tenantIdString: string
  ) {}

  /**
   * Get replay status
   *
   * @param replayId - The replay session ID
   * @returns Response object with data property (status 404 if not found)
   */
  async getReplayStatus(
    replayId: string
  ): Promise<TestResponseWithData<ReplayStatusResponse | { error: string }>> {
    const response = await this.server.request({
      method: 'GET',
      url: `/v1/platform/event-replay/${replayId}`,
      headers: {
        Authorization: `Bearer ${this.jwtToken}`,
        'x-tenant-id': this.tenantIdString
      }
    });

    // Alias body to data for test convenience
    const responseWithData = response as TestResponseWithData<
      ReplayStatusResponse | { error: string }
    >;
    responseWithData.data =
      extractResponseData<ReplayStatusResponse | { error: string }>(response.body) ??
      ({ error: 'Unknown response format' } as { error: string });
    return responseWithData;
  }

  /**
   * Start a new replay
   *
   * @param body - Replay options (pass tenantId to override default from helper)
   * @returns Response object with data property (aliased from body)
   */
  async startReplay(body: {
    aggregateId?: string;
    tenantId?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    maxEvents?: number;
  }): Promise<TestResponseWithData<ReplayStatusResponse>> {
    // Include tenantId in request body (use passed value or default from helper)
    const requestBody = {
      tenantId: body.tenantId ?? this.tenantIdString,
      aggregateId: body.aggregateId,
      eventType: body.eventType,
      startDate: body.startDate,
      endDate: body.endDate,
      maxEvents: body.maxEvents
    };

    const response = await this.server.request({
      method: 'POST',
      url: '/v1/platform/event-replay',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.jwtToken}`,
        'x-tenant-id': this.tenantIdString
      },
      body: requestBody
    });

    // Alias body to data for test convenience
    const responseWithData = response as TestResponseWithData<ReplayStatusResponse>;
    responseWithData.data =
      extractResponseData<ReplayStatusResponse>(response.body) ??
      ({
        replayId: '',
        status: ReplayStatus.FAILED,
        processedCount: 0,
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        startedAt: new Date(0).toISOString()
      } as ReplayStatusResponse);
    return responseWithData;
  }

  /**
   * Cancel an active replay session
   *
   * @param replayId - The replay session ID to cancel
   * @returns Response object with data property
   */
  async cancelReplay(
    replayId: string
  ): Promise<TestResponseWithData<{ success: boolean; message?: string }>> {
    const response = await this.server.request({
      method: 'POST',
      url: `/v1/platform/event-replay/${replayId}/cancel`,
      headers: {
        Authorization: `Bearer ${this.jwtToken}`,
        'x-tenant-id': this.tenantIdString
      }
    });

    // Alias body to data for test convenience
    const responseWithData = response as TestResponseWithData<{
      success: boolean;
      message?: string;
    }>;
    responseWithData.data = extractResponseData<{ success: boolean; message?: string }>(
      response.body
    ) ?? {
      success: false
    };
    return responseWithData;
  }

  /**
   * Wait for replay completion using polling
   *
   * @param replayId - The replay session ID
   * @param options - Polling options
   * @returns Final replay status and session
   */
  async waitForCompletion(
    replayId: string,
    options: WaitForReplayOptions = {}
  ): Promise<{ status: ReplayStatus; session: ReplayStatusResponse }> {
    return waitForReplayCompletion(
      this.server,
      replayId,
      this.jwtToken,
      this.tenantIdString,
      options
    );
  }
}

/**
 * Create event replay helper instance
 */
export function createEventReplayHelper(
  server: TestServer,
  jwtToken: string,
  tenantIdString: string
): EventReplayHelper {
  return new EventReplayHelper(server, jwtToken, tenantIdString);
}
