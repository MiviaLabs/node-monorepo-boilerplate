/**
 * Standard OpenTelemetry attribute keys and values for infrastructure operations.
 *
 * This module provides semantic convention constants for span and metric attributes.
 * Using standardized attribute names ensures consistency across services and enables
 * better querying, filtering, and visualization in observability tools.
 *
 * @remarks
 * These constants follow the OpenTelemetry Semantic Conventions specification,
 * which defines standard attribute names and values for common operations like
 * database queries, HTTP requests, messaging, and caching.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/ | OpenTelemetry Semantic Conventions}
 * @see {@link https://opentelemetry.io/docs/specs/semconv/general/attributes/ | General Attributes}
 *
 * @example Using attribute constants in spans
 * ```typescript
 * import { withSpan } from '@package/core/opentelemetry';
 * import { DB_ATTRS, DB_SYSTEMS } from '@package/core/opentelemetry/attributes';
 *
 * async function queryDatabase(sql: string): Promise<Result> {
 *   return withSpan('db.query', async (span) => {
 *     span.setAttribute(DB_ATTRS.SYSTEM, DB_SYSTEMS.POSTGRESQL);
 *     span.setAttribute(DB_ATTRS.OPERATION, 'SELECT');
 *     span.setAttribute(DB_ATTRS.STATEMENT, sql);
 *     return await db.execute(sql);
 *   });
 * }
 * ```
 *
 * @example Combining multiple attribute groups
 * ```typescript
 * import { withSpan, addSpanAttributes } from '@package/core/opentelemetry';
 * import {
 *   MESSAGING_ATTRS,
 *   MESSAGING_SYSTEMS,
 *   MESSAGING_OPERATIONS,
 *   INFRASTRUCTURE_ATTRS,
 *   INFRASTRUCTURE_PROVIDERS
 * } from '@package/core/opentelemetry/attributes';
 *
 * async function publishMessage(message: Message): Promise<void> {
 *   return withSpan('message.publish', async (span) => {
 *     addSpanAttributes({
 *       [MESSAGING_ATTRS.SYSTEM]: MESSAGING_SYSTEMS.RABBITMQ,
 *       [MESSAGING_ATTRS.OPERATION]: MESSAGING_OPERATIONS.PUBLISH,
 *       [MESSAGING_ATTRS.DESTINATION]: message.queue,
 *       [MESSAGING_ATTRS.MESSAGE_ID]: message.id,
 *       [INFRASTRUCTURE_ATTRS.PROVIDER]: INFRASTRUCTURE_PROVIDERS.AWS
 *     });
 *     await broker.publish(message);
 *   });
 * }
 * ```
 *
 * @module
 */

/**
 * Standard attribute keys for database operations.
 *
 * Use these constants when instrumenting database queries, connections,
 * and transactions. Following these conventions enables correlation of
 * database performance across different database systems.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/database/database-spans/ | Database Semantic Conventions}
 * @see {@link DB_SYSTEMS} - Standard values for the `db.system` attribute
 *
 * @example Basic database query instrumentation
 * ```typescript
 * import { withSpan } from '@package/core/opentelemetry';
 * import { DB_ATTRS, DB_SYSTEMS } from '@package/core/opentelemetry/attributes';
 *
 * async function findUserById(id: string): Promise<User> {
 *   return withSpan('users.findById', async (span) => {
 *     span.setAttribute(DB_ATTRS.SYSTEM, DB_SYSTEMS.POSTGRESQL);
 *     span.setAttribute(DB_ATTRS.NAME, 'users');
 *     span.setAttribute(DB_ATTRS.OPERATION, 'SELECT');
 *     span.setAttribute(DB_ATTRS.STATEMENT, 'SELECT * FROM users WHERE id = $1');
 *
 *     return await db.query('SELECT * FROM users WHERE id = $1', [id]);
 *   });
 * }
 * ```
 *
 * @example Using with createSpanOptions
 * ```typescript
 * import { createSpanOptions, withSpan } from '@package/core/opentelemetry';
 * import { DB_ATTRS, DB_SYSTEMS } from '@package/core/opentelemetry/attributes';
 *
 * const dbOptions = createSpanOptions({
 *   [DB_ATTRS.SYSTEM]: DB_SYSTEMS.POSTGRESQL,
 *   [DB_ATTRS.USER]: 'app_user'
 * });
 *
 * await withSpan('db.connect', async (span) => {
 *   // ... connect to database
 * }, dbOptions);
 * ```
 */
export const DB_ATTRS = {
  /**
   * The database management system (DBMS) product identifier.
   * @example 'postgresql', 'mysql', 'redis'
   * @see {@link DB_SYSTEMS} for standard values
   */
  SYSTEM: 'db.system',

  /**
   * The name of the database being accessed.
   * For PostgreSQL, this is the database name.
   * @example 'users', 'orders', 'main'
   */
  NAME: 'db.name',

  /**
   * The database statement being executed.
   * Should be sanitized to remove sensitive data.
   * @example 'SELECT * FROM users WHERE id = ?'
   */
  STATEMENT: 'db.statement',

  /**
   * The name of the operation being executed.
   * @example 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'findOne'
   */
  OPERATION: 'db.operation',

  /**
   * The database user used for authentication.
   * @example 'app_user', 'readonly_user'
   */
  USER: 'db.user'
} as const;

/**
 * Standard attribute keys for messaging operations (queues, events, pub/sub).
 *
 * Use these constants when instrumenting message brokers, event buses,
 * and queue systems. They help trace messages across service boundaries.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/ | Messaging Semantic Conventions}
 * @see {@link MESSAGING_SYSTEMS} - Standard values for messaging systems
 * @see {@link MESSAGING_OPERATIONS} - Standard values for messaging operations
 *
 * @example Publishing an event
 * ```typescript
 * import { withSpanKind, InfrastructureSpanKind } from '@package/core/opentelemetry';
 * import {
 *   MESSAGING_ATTRS,
 *   MESSAGING_SYSTEMS,
 *   MESSAGING_OPERATIONS
 * } from '@package/core/opentelemetry/attributes';
 *
 * async function publishUserCreatedEvent(user: User): Promise<void> {
 *   return withSpanKind('event.user.created', InfrastructureSpanKind.PRODUCER, async (span) => {
 *     span.setAttribute(MESSAGING_ATTRS.SYSTEM, MESSAGING_SYSTEMS.RABBITMQ);
 *     span.setAttribute(MESSAGING_ATTRS.DESTINATION, 'user.events');
 *     span.setAttribute(MESSAGING_ATTRS.DESTINATION_KIND, 'topic');
 *     span.setAttribute(MESSAGING_ATTRS.OPERATION, MESSAGING_OPERATIONS.PUBLISH);
 *     span.setAttribute(MESSAGING_ATTRS.MESSAGE_ID, generateId());
 *
 *     await eventBus.publish('user.created', user);
 *   });
 * }
 * ```
 *
 * @example Consuming from a queue
 * ```typescript
 * import { withSpanKind, InfrastructureSpanKind } from '@package/core/opentelemetry';
 * import {
 *   MESSAGING_ATTRS,
 *   MESSAGING_SYSTEMS,
 *   MESSAGING_OPERATIONS
 * } from '@package/core/opentelemetry/attributes';
 *
 * async function processJob(job: Job): Promise<void> {
 *   return withSpanKind('job.process', InfrastructureSpanKind.CONSUMER, async (span) => {
 *     span.setAttribute(MESSAGING_ATTRS.SYSTEM, MESSAGING_SYSTEMS.REDIS);
 *     span.setAttribute(MESSAGING_ATTRS.DESTINATION, job.queue);
 *     span.setAttribute(MESSAGING_ATTRS.DESTINATION_KIND, 'queue');
 *     span.setAttribute(MESSAGING_ATTRS.OPERATION, MESSAGING_OPERATIONS.PROCESS);
 *     span.setAttribute(MESSAGING_ATTRS.MESSAGE_ID, job.id);
 *
 *     await job.execute();
 *   });
 * }
 * ```
 */
export const MESSAGING_ATTRS = {
  /**
   * The messaging system identifier.
   * @example 'rabbitmq', 'kafka', 'redis'
   * @see {@link MESSAGING_SYSTEMS} for standard values
   */
  SYSTEM: 'messaging.system',

  /**
   * The message destination name (queue, topic, or exchange name).
   * @example 'user.events', 'order.processing', 'notifications'
   */
  DESTINATION: 'messaging.destination',

  /**
   * The kind of message destination.
   * @example 'queue', 'topic', 'exchange'
   */
  DESTINATION_KIND: 'messaging.destination_kind',

  /**
   * A unique identifier for the message.
   * @example 'msg-123', 'evt-456', UUID
   */
  MESSAGE_ID: 'messaging.message.id',

  /**
   * The conversation ID for correlating related messages.
   * @example 'order-123-workflow', 'saga-456'
   */
  CONVERSATION_ID: 'messaging.conversation_id',

  /**
   * The messaging operation being performed.
   * @example 'publish', 'receive', 'process'
   * @see {@link MESSAGING_OPERATIONS} for standard values
   */
  OPERATION: 'messaging.operation'
} as const;

/**
 * Standard attribute keys for HTTP operations.
 *
 * Use these constants when instrumenting HTTP clients and servers.
 * Note: Modern OpenTelemetry conventions use `http.request.*` and
 * `http.response.*` prefixes, but legacy attributes are still supported.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/http/http-spans/ | HTTP Semantic Conventions}
 *
 * @example HTTP client instrumentation
 * ```typescript
 * import { withSpanKind, InfrastructureSpanKind } from '@package/core/opentelemetry';
 * import { HTTP_ATTRS } from '@package/core/opentelemetry/attributes';
 *
 * async function fetchData(url: string): Promise<Response> {
 *   return withSpanKind('http.client', InfrastructureSpanKind.CLIENT, async (span) => {
 *     span.setAttribute(HTTP_ATTRS.METHOD, 'GET');
 *     span.setAttribute(HTTP_ATTRS.URL, url);
 *
 *     const response = await fetch(url);
 *     span.setAttribute(HTTP_ATTRS.STATUS_CODE, response.status);
 *
 *     return response;
 *   });
 * }
 * ```
 *
 * @example Using modern attribute names
 * ```typescript
 * import { addSpanAttributes } from '@package/core/opentelemetry';
 * import { HTTP_ATTRS } from '@package/core/opentelemetry/attributes';
 *
 * function recordHttpRequest(method: string, url: string, status: number): void {
 *   addSpanAttributes({
 *     [HTTP_ATTRS.REQUEST_METHOD]: method,
 *     [HTTP_ATTRS.URL]: url,
 *     [HTTP_ATTRS.RESPONSE_STATUS_CODE]: status
 *   });
 * }
 * ```
 */
export const HTTP_ATTRS = {
  /**
   * HTTP request method (legacy attribute).
   * @example 'GET', 'POST', 'PUT', 'DELETE'
   * @deprecated Use HTTP_ATTRS.REQUEST_METHOD for new code
   */
  METHOD: 'http.method',

  /**
   * Full HTTP request URL.
   * Should exclude sensitive query parameters.
   * @example 'https://api.example.com/users/123'
   */
  URL: 'http.url',

  /**
   * HTTP response status code (legacy attribute).
   * @example 200, 404, 500
   * @deprecated Use HTTP_ATTRS.RESPONSE_STATUS_CODE for new code
   */
  STATUS_CODE: 'http.status_code',

  /**
   * HTTP request method (modern attribute).
   * @example 'GET', 'POST', 'PUT', 'DELETE'
   */
  REQUEST_METHOD: 'http.request.method',

  /**
   * HTTP response status code (modern attribute).
   * @example 200, 404, 500
   */
  RESPONSE_STATUS_CODE: 'http.response.status_code'
} as const;

/**
 * Standard attribute keys for RPC (Remote Procedure Call) operations.
 *
 * Use these constants when instrumenting gRPC, JSON-RPC, or other RPC frameworks.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/rpc/rpc-spans/ | RPC Semantic Conventions}
 *
 * @example gRPC client call
 * ```typescript
 * import { withSpanKind, InfrastructureSpanKind } from '@package/core/opentelemetry';
 * import { RPC_ATTRS } from '@package/core/opentelemetry/attributes';
 *
 * async function callUserService(userId: string): Promise<User> {
 *   return withSpanKind('grpc.call', InfrastructureSpanKind.CLIENT, async (span) => {
 *     span.setAttribute(RPC_ATTRS.SYSTEM, 'grpc');
 *     span.setAttribute(RPC_ATTRS.SERVICE, 'UserService');
 *     span.setAttribute(RPC_ATTRS.METHOD, 'GetUser');
 *
 *     return await userClient.getUser({ id: userId });
 *   });
 * }
 * ```
 */
export const RPC_ATTRS = {
  /**
   * The RPC system being used.
   * @example 'grpc', 'json_rpc', 'apache_dubbo'
   */
  SYSTEM: 'rpc.system',

  /**
   * The full name of the service being called.
   * @example 'UserService', 'myservice.EchoService'
   */
  SERVICE: 'rpc.service',

  /**
   * The name of the method being called.
   * @example 'GetUser', 'ListUsers', 'CreateOrder'
   */
  METHOD: 'rpc.method'
} as const;

/**
 * Standard attribute keys for cache operations.
 *
 * Use these constants when instrumenting cache systems like Redis,
 * Memcached, or in-memory caches. These are custom attributes that
 * complement the standard database attributes for cache-specific use cases.
 *
 * @example Cache get with hit/miss tracking
 * ```typescript
 * import { withSpan, addSpanAttributes } from '@package/core/opentelemetry';
 * import { CACHE_ATTRS, CACHE_OPERATIONS } from '@package/core/opentelemetry/attributes';
 *
 * async function getCachedUser(key: string): Promise<User | null> {
 *   return withSpan('cache.get', async (span) => {
 *     span.setAttribute(CACHE_ATTRS.KEY, key);
 *     span.setAttribute(CACHE_ATTRS.OPERATION, CACHE_OPERATIONS.GET);
 *
 *     const value = await redis.get(key);
 *     span.setAttribute(CACHE_ATTRS.HIT, value !== null);
 *
 *     return value ? JSON.parse(value) : null;
 *   });
 * }
 * ```
 *
 * @example Cache set with TTL
 * ```typescript
 * import { withSpan } from '@package/core/opentelemetry';
 * import { CACHE_ATTRS, CACHE_OPERATIONS } from '@package/core/opentelemetry/attributes';
 *
 * async function cacheUser(key: string, user: User, ttlSeconds: number): Promise<void> {
 *   return withSpan('cache.set', async (span) => {
 *     span.setAttribute(CACHE_ATTRS.KEY, key);
 *     span.setAttribute(CACHE_ATTRS.OPERATION, CACHE_OPERATIONS.SET);
 *     span.setAttribute(CACHE_ATTRS.TTL, ttlSeconds);
 *
 *     await redis.set(key, JSON.stringify(user), 'EX', ttlSeconds);
 *   });
 * }
 * ```
 */
export const CACHE_ATTRS = {
  /**
   * Whether the cache lookup was a hit (true) or miss (false).
   * @example true, false
   */
  HIT: 'cache.hit',

  /**
   * The cache key being accessed.
   * Should be sanitized to remove sensitive data if needed.
   * @example 'user:123', 'session:abc', 'config:feature-flags'
   */
  KEY: 'cache.key',

  /**
   * The cache operation being performed.
   * @example 'get', 'set', 'delete', 'exists'
   * @see {@link CACHE_OPERATIONS} for standard values
   */
  OPERATION: 'cache.operation',

  /**
   * Time-to-live in seconds for cache entries.
   * @example 300, 3600, 86400
   */
  TTL: 'cache.ttl'
} as const;

/**
 * Custom attribute keys for infrastructure-specific operations.
 *
 * Use these constants for operations that don't fit standard semantic
 * conventions, such as custom providers, retry logic, or resource management.
 *
 * @example Infrastructure provider operation
 * ```typescript
 * import { withSpan } from '@package/core/opentelemetry';
 * import {
 *   INFRASTRUCTURE_ATTRS,
 *   INFRASTRUCTURE_PROVIDERS
 * } from '@package/core/opentelemetry/attributes';
 *
 * async function uploadToS3(bucket: string, key: string, data: Buffer): Promise<void> {
 *   return withSpan('s3.upload', async (span) => {
 *     span.setAttribute(INFRASTRUCTURE_ATTRS.PROVIDER, INFRASTRUCTURE_PROVIDERS.AWS);
 *     span.setAttribute(INFRASTRUCTURE_ATTRS.OPERATION, 'PutObject');
 *     span.setAttribute(INFRASTRUCTURE_ATTRS.RESOURCE_TYPE, 'bucket');
 *     span.setAttribute(INFRASTRUCTURE_ATTRS.RESOURCE_ID, bucket);
 *
 *     await s3.putObject({ Bucket: bucket, Key: key, Body: data });
 *   });
 * }
 * ```
 *
 * @example Tracking retry attempts
 * ```typescript
 * import { addSpanAttributes } from '@package/core/opentelemetry';
 * import { INFRASTRUCTURE_ATTRS } from '@package/core/opentelemetry/attributes';
 *
 * async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
 *   let attempt = 0;
 *   while (true) {
 *     attempt++;
 *     addSpanAttributes({
 *       [INFRASTRUCTURE_ATTRS.ATTEMPT_COUNT]: attempt,
 *       [INFRASTRUCTURE_ATTRS.RETRY_COUNT]: attempt - 1
 *     });
 *
 *     try {
 *       return await fn();
 *     } catch (error) {
 *       if (attempt >= maxAttempts) throw error;
 *     }
 *   }
 * }
 * ```
 */
export const INFRASTRUCTURE_ATTRS = {
  /**
   * The infrastructure provider or service name.
   * @example 'aws', 'gcp', 'azure', 'redis', 'vault'
   * @see {@link INFRASTRUCTURE_PROVIDERS} for standard values
   */
  PROVIDER: 'infrastructure.provider',

  /**
   * The operation being performed on the infrastructure.
   * @example 'read', 'write', 'connect', 'PutObject', 'GetSecret'
   */
  OPERATION: 'infrastructure.operation',

  /**
   * The unique identifier of the resource being accessed.
   * @example 'my-bucket', 'secret/api-key', 'cluster-123'
   */
  RESOURCE_ID: 'infrastructure.resource.id',

  /**
   * The type of resource being accessed.
   * @example 'bucket', 'secret', 'cluster', 'function'
   */
  RESOURCE_TYPE: 'infrastructure.resource.type',

  /**
   * The number of retry attempts (0 for first try).
   * @example 0, 1, 2, 3
   */
  RETRY_COUNT: 'infrastructure.retry.count',

  /**
   * The current attempt number (1 for first try).
   * @example 1, 2, 3, 4
   */
  ATTEMPT_COUNT: 'infrastructure.attempt.count'
} as const;

/**
 * Standard attribute values for messaging system identifiers.
 *
 * Use these constants as values for the `messaging.system` attribute
 * to ensure consistent identification of messaging systems.
 *
 * @see {@link MESSAGING_ATTRS.SYSTEM} - The attribute key to use with these values
 *
 * @example
 * ```typescript
 * import { MESSAGING_ATTRS, MESSAGING_SYSTEMS } from '@package/core/opentelemetry/attributes';
 *
 * span.setAttribute(MESSAGING_ATTRS.SYSTEM, MESSAGING_SYSTEMS.RABBITMQ);
 * span.setAttribute(MESSAGING_ATTRS.SYSTEM, MESSAGING_SYSTEMS.KAFKA);
 * span.setAttribute(MESSAGING_ATTRS.SYSTEM, MESSAGING_SYSTEMS.REDIS);
 * ```
 */
export const MESSAGING_SYSTEMS = {
  /** Apache Kafka message broker */
  KAFKA: 'kafka',
  /** Redis Pub/Sub or Streams */
  REDIS: 'redis',
  /** RabbitMQ message broker */
  RABBITMQ: 'rabbitmq',
  /** Amazon Simple Queue Service */
  SQS: 'aws_sqs',
  /** Google Cloud Pub/Sub */
  PUBSUB: 'gcp_pubsub'
} as const;

/**
 * Standard attribute values for database system identifiers.
 *
 * Use these constants as values for the `db.system` attribute
 * to ensure consistent identification of database systems.
 *
 * @see {@link DB_ATTRS.SYSTEM} - The attribute key to use with these values
 *
 * @example
 * ```typescript
 * import { DB_ATTRS, DB_SYSTEMS } from '@package/core/opentelemetry/attributes';
 *
 * span.setAttribute(DB_ATTRS.SYSTEM, DB_SYSTEMS.POSTGRESQL);
 * span.setAttribute(DB_ATTRS.SYSTEM, DB_SYSTEMS.REDIS);
 * span.setAttribute(DB_ATTRS.SYSTEM, DB_SYSTEMS.MONGODB);
 * ```
 */
export const DB_SYSTEMS = {
  /** PostgreSQL relational database */
  POSTGRESQL: 'postgresql',
  /** MySQL relational database */
  MYSQL: 'mysql',
  /** Redis in-memory data store */
  REDIS: 'redis',
  /** MongoDB document database */
  MONGODB: 'mongodb',
  /** Elasticsearch search engine */
  ELASTICSEARCH: 'elasticsearch'
} as const;

/**
 * Standard attribute values for messaging operations.
 *
 * Use these constants as values for the `messaging.operation` attribute
 * to describe what action is being performed on a message.
 *
 * @see {@link MESSAGING_ATTRS.OPERATION} - The attribute key to use with these values
 *
 * @example
 * ```typescript
 * import { MESSAGING_ATTRS, MESSAGING_OPERATIONS } from '@package/core/opentelemetry/attributes';
 *
 * // Publishing a message
 * span.setAttribute(MESSAGING_ATTRS.OPERATION, MESSAGING_OPERATIONS.PUBLISH);
 *
 * // Receiving a message from a queue
 * span.setAttribute(MESSAGING_ATTRS.OPERATION, MESSAGING_OPERATIONS.RECEIVE);
 *
 * // Processing a received message
 * span.setAttribute(MESSAGING_ATTRS.OPERATION, MESSAGING_OPERATIONS.PROCESS);
 * ```
 */
export const MESSAGING_OPERATIONS = {
  /** Receiving a message from a destination */
  RECEIVE: 'receive',
  /** Processing a previously received message */
  PROCESS: 'process',
  /** Publishing/sending a message to a destination */
  PUBLISH: 'publish',
  /** Creating a message or destination */
  CREATE: 'create',
  /** Deleting a message or destination */
  DELETE: 'delete'
} as const;

/**
 * Standard attribute values for cache operations.
 *
 * Use these constants as values for the `cache.operation` attribute
 * to describe what action is being performed on the cache.
 *
 * @see {@link CACHE_ATTRS.OPERATION} - The attribute key to use with these values
 *
 * @example
 * ```typescript
 * import { CACHE_ATTRS, CACHE_OPERATIONS } from '@package/core/opentelemetry/attributes';
 *
 * // Getting a value
 * span.setAttribute(CACHE_ATTRS.OPERATION, CACHE_OPERATIONS.GET);
 *
 * // Setting a value
 * span.setAttribute(CACHE_ATTRS.OPERATION, CACHE_OPERATIONS.SET);
 *
 * // Incrementing a counter
 * span.setAttribute(CACHE_ATTRS.OPERATION, CACHE_OPERATIONS.INCREMENT);
 * ```
 */
export const CACHE_OPERATIONS = {
  /** Retrieve a value by key */
  GET: 'get',
  /** Store a value with a key */
  SET: 'set',
  /** Remove a value by key */
  DELETE: 'delete',
  /** Increment a numeric value */
  INCREMENT: 'increment',
  /** Decrement a numeric value */
  DECREMENT: 'decrement',
  /** Check if a key exists */
  EXISTS: 'exists'
} as const;

/**
 * Standard attribute values for infrastructure providers.
 *
 * Use these constants as values for the `infrastructure.provider` attribute
 * to identify the cloud provider or infrastructure service.
 *
 * @see {@link INFRASTRUCTURE_ATTRS.PROVIDER} - The attribute key to use with these values
 *
 * @example
 * ```typescript
 * import {
 *   INFRASTRUCTURE_ATTRS,
 *   INFRASTRUCTURE_PROVIDERS
 * } from '@package/core/opentelemetry/attributes';
 *
 * // AWS S3 operation
 * span.setAttribute(INFRASTRUCTURE_ATTRS.PROVIDER, INFRASTRUCTURE_PROVIDERS.AWS);
 *
 * // HashiCorp Vault secret access
 * span.setAttribute(INFRASTRUCTURE_ATTRS.PROVIDER, INFRASTRUCTURE_PROVIDERS.VAULT);
 *
 * // Redis cache operation
 * span.setAttribute(INFRASTRUCTURE_ATTRS.PROVIDER, INFRASTRUCTURE_PROVIDERS.REDIS);
 * ```
 */
export const INFRASTRUCTURE_PROVIDERS = {
  /** Amazon Web Services */
  AWS: 'aws',
  /** Google Cloud Platform */
  GCP: 'gcp',
  /** Microsoft Azure */
  AZURE: 'azure',
  /** HashiCorp Vault */
  VAULT: 'vault',
  /** Redis */
  REDIS: 'redis',
  /** Apache Kafka */
  KAFKA: 'kafka',
  /** RabbitMQ message broker */
  RABBITMQ: 'rabbitmq'
} as const;
