/**
 * @package/tasks
 *
 * Google Cloud Tasks integration package providing a unified interface
 * for creating and managing Cloud Tasks queues and tasks with enterprise
 * features including OpenTelemetry tracing and mock providers for testing.
 *
 * ## Features
 *
 * - **Queue Management**: Create, delete, get, and list queues with {@link CloudTasksProvider}
 * - **Task Creation**: Schedule HTTP and App Engine tasks with {@link createCloudTasksProvider}
 * - **HTTP Targets**: Configure external HTTP endpoints via {@link HttpTargetOptions}
 * - **App Engine Targets**: Route to App Engine services via {@link AppEngineHttpTargetOptions}
 * - **Environment Config**: Auto-resolve settings with {@link resolveConfig} and {@link ENV_VARS}
 * - **OpenTelemetry Tracing**: Built-in distributed tracing for all operations
 * - **Mock Provider**: In-memory {@link MockCloudTasksProvider} for fast, isolated tests
 * - **Type-Safe Errors**: Specific error classes like {@link QueueNotFoundError}, {@link TaskCreationFailedError}
 *
 * ## Architecture: Task Creation Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      Application Code                           │
 * │         createCloudTasksProvider() / new CloudTasksProvider()   │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  1. Configuration Resolution                                    │
 * │     - resolveConfig() reads from environment variables          │
 * │     - Validates projectId, location, credentials                │
 * │     - Merges with DEFAULT_CLIENT_CONFIG defaults                │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  2. Provider Initialization                                     │
 * │     - CloudTasksProvider: Production Google Cloud Tasks client  │
 * │     - MockCloudTasksProvider: In-memory for testing (testMode)  │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  3. Task Operations (with OpenTelemetry spans)                  │
 * │     - createQueue() / deleteQueue() / getQueue() / listQueues() │
 * │     - createHttpTask() / createAppEngineTask()                  │
 * │     - deleteTask() / getTask()                                  │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  4. Google Cloud Tasks API                                      │
 * │     - Queue: projects/{project}/locations/{location}/queues/*   │
 * │     - Task executes HTTP request to target at scheduled time    │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  5. HTTP Handler (Your Application)                             │
 * │     - Receives task payload at configured URL                   │
 * │     - Processes task and returns success/failure                │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Provider Setup
 *
 * ```typescript
 * import {
 *   createCloudTasksProvider,
 *   createMockCloudTasksProvider,
 *   HttpMethod,
 * } from '@package/tasks';
 *
 * // Production: Auto-configure from environment variables
 * const provider = createCloudTasksProvider();
 *
 * // Production: Explicit configuration
 * const provider = createCloudTasksProvider({
 *   projectId: 'my-project',
 *   location: 'us-central1',
 *   credentials: { keyFile: '/path/to/service-account.json' },
 *   enableTracing: true,
 * });
 *
 * // Testing: Mock provider with no network calls
 * const mockProvider = createMockCloudTasksProvider(
 *   { projectId: 'test-project', location: 'us-central1' },
 *   { delayMs: 0 } // No simulated delay for fast tests
 * );
 * ```
 *
 * ## Creating Tasks
 *
 * ```typescript
 * import { HttpMethod, QueueState } from '@package/tasks';
 *
 * // Create a queue with rate limiting
 * await provider.createQueue('email-queue', {
 *   state: QueueState.RUNNING,
 *   rateLimits: { maxRequestsPerSecond: 100, maxConcurrentDispatches: 50 },
 *   retryConfig: { maxAttempts: 5, minBackoffInSeconds: 10 },
 * });
 *
 * // Create an HTTP task (external endpoint)
 * const task = await provider.createHttpTask('email-queue', {
 *   url: 'https://api.example.com/send-email',
 *   httpMethod: HttpMethod.POST,
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     tenantId: 'tenant-123',
 *     to: 'user@example.com',
 *     subject: 'Hello',
 *   }),
 * }, {
 *   scheduleTime: new Date(Date.now() + 60000), // 1 minute from now
 *   priority: 3, // Higher priority (0-10, lower = higher)
 * });
 *
 * // Create an App Engine task (internal service)
 * await provider.createAppEngineTask('worker-queue', {
 *   relativeUri: '/api/tasks/process',
 *   httpMethod: HttpMethod.POST,
 *   appEngineRouting: { service: 'worker', version: 'v1' },
 *   body: JSON.stringify({ tenantId: 'tenant-123', jobId: '12345' }),
 * });
 * ```
 *
 * ## Error Handling
 *
 * ```typescript
 * import {
 *   QueueNotFoundError,
 *   QueueAlreadyExistsError,
 *   TaskCreationFailedError,
 *   InvalidTaskConfigError,
 *   RateLimitExceededError,
 * } from '@package/tasks';
 *
 * try {
 *   await provider.createHttpTask('my-queue', { url: 'https://api.example.com' });
 * } catch (error) {
 *   if (error instanceof QueueNotFoundError) {
 *     console.error('Queue does not exist:', error.message);
 *   } else if (error instanceof RateLimitExceededError) {
 *     console.error('Rate limited, retry later');
 *   } else if (error instanceof InvalidTaskConfigError) {
 *     console.error('Invalid configuration:', error.message);
 *   }
 * }
 * ```
 *
 * @see {@link CloudTasksProvider} for production Cloud Tasks operations
 * @see {@link MockCloudTasksProvider} for testing without network calls
 * @see {@link createCloudTasksProvider} for factory-based provider creation
 * @see {@link CloudTasksConfig} for configuration options
 *
 * Related packages:
 * - `@package/queues` - In-process job queues (BullMQ)
 * - `@package/observability` - Logging and tracing integration
 *
 * @packageDocumentation
 */

// ====================================================================
// Configuration
// ====================================================================
export * from './config';

// ====================================================================
// Errors
// ====================================================================
export * from './errors';

// ====================================================================
// Providers
// ====================================================================
export * from './providers';
