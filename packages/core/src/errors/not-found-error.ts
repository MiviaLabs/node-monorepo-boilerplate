import { InfrastructureError } from './infrastructure-error';

/**
 * Error thrown when an infrastructure resource cannot be found.
 *
 * This is the base class for all not-found errors in the infrastructure layer,
 * used when required resources, services, or components cannot be located
 * during runtime operations. These errors indicate configuration or dependency
 * resolution failures rather than business logic issues.
 *
 * Not-found errors in the infrastructure layer differ from HTTP 404 responses:
 * - Infrastructure NotFoundError: Internal resource missing (provider, queue, worker)
 * - HTTP 404: User-requested entity doesn't exist in the database
 *
 * **Error Hierarchy:**
 * ```
 * InfrastructureError
 * └── NotFoundError
 *     ├── ProviderNotFoundError  (service provider not registered)
 *     ├── QueueNotFoundError     (message queue not configured)
 *     └── WorkerNotFoundError    (background worker not registered)
 * ```
 *
 * @example Generic resource not found
 * ```typescript
 * const handler = registry.get(commandType);
 * if (!handler) {
 *   throw new NotFoundError('CommandHandler', commandType);
 * }
 * // Message: "CommandHandler 'CreateUserCommand' not found"
 * ```
 *
 * @example Dynamic resource lookup
 * ```typescript
 * function getResource<T>(type: string, id: string, registry: Map<string, T>): T {
 *   const resource = registry.get(id);
 *   if (!resource) {
 *     throw new NotFoundError(type, id);
 *   }
 *   return resource;
 * }
 *
 * // Usage
 * const validator = getResource('Validator', 'email', validators);
 * ```
 *
 * @example Prefer specialized subclasses when available
 * ```typescript
 * // Instead of:
 * throw new NotFoundError('Provider', 'email-sender');
 *
 * // Use:
 * throw new ProviderNotFoundError('email-sender');
 * ```
 *
 * @see {@link ProviderNotFoundError} - When a service provider is not registered
 * @see {@link QueueNotFoundError} - When a message queue is not configured
 * @see {@link WorkerNotFoundError} - When a background worker is not registered
 * @see {@link InfrastructureError} - Parent class providing error code and serialization
 */
export class NotFoundError extends InfrastructureError {
  /**
   * Creates a new NotFoundError instance.
   *
   * @param resourceType - The type or category of the resource that was not
   *   found. Use PascalCase for consistency (e.g., 'Provider', 'Handler',
   *   'Validator', 'Module'). This appears in the error message and helps
   *   identify the kind of resource that's missing.
   * @param identifier - The unique identifier or name that was used to look
   *   up the resource. This could be a string name, a class name, or any
   *   other identifier used in the lookup operation.
   *
   * @example
   * ```typescript
   * // Handler not found
   * throw new NotFoundError('Handler', 'CreateOrderCommand');
   * // Message: "Handler 'CreateOrderCommand' not found"
   *
   * // Module not found
   * throw new NotFoundError('Module', 'payments');
   * // Message: "Module 'payments' not found"
   *
   * // Configuration section not found
   * throw new NotFoundError('ConfigSection', 'database.replica');
   * // Message: "ConfigSection 'database.replica' not found"
   * ```
   */
  constructor(resourceType: string, identifier: string) {
    super(`${resourceType} '${identifier}' not found`, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when a service provider implementation cannot be found.
 *
 * This specialized not-found error indicates that a required service provider
 * is not registered in the dependency injection container or service registry.
 * Providers are typically infrastructure services like email senders, payment
 * processors, storage adapters, or notification services.
 *
 * Provider not-found errors usually indicate:
 * - Missing dependency injection configuration
 * - Incorrect provider name in the lookup
 * - Module not imported or loaded
 * - Provider conditionally excluded based on environment
 *
 * @extends NotFoundError
 *
 * @example Dependency injection lookup failure
 * ```typescript
 * class NotificationService {
 *   constructor(private readonly container: Container) {}
 *
 *   async send(channel: string, message: Message) {
 *     const provider = this.container.get<INotificationProvider>(`${channel}-provider`);
 *     if (!provider) {
 *       throw new ProviderNotFoundError(`${channel}-provider`);
 *     }
 *     return provider.send(message);
 *   }
 * }
 * ```
 *
 * @example Plugin system with providers
 * ```typescript
 * class PluginRegistry {
 *   private providers = new Map<string, IPlugin>();
 *
 *   getProvider(name: string): IPlugin {
 *     const provider = this.providers.get(name);
 *     if (!provider) {
 *       throw new ProviderNotFoundError(name);
 *     }
 *     return provider;
 *   }
 * }
 * ```
 *
 * @example Storage provider resolution
 * ```typescript
 * function getStorageProvider(type: 's3' | 'gcs' | 'local'): IStorageProvider {
 *   const providers = {
 *     s3: new S3Provider(),
 *     gcs: new GCSProvider(),
 *     local: new LocalProvider()
 *   };
 *
 *   const provider = providers[type];
 *   if (!provider) {
 *     throw new ProviderNotFoundError(type);
 *   }
 *   return provider;
 * }
 * ```
 *
 * @see {@link NotFoundError} - Parent class for all not-found errors
 * @see {@link QueueNotFoundError} - When a message queue is not configured
 * @see {@link WorkerNotFoundError} - When a background worker is not registered
 */
export class ProviderNotFoundError extends NotFoundError {
  /**
   * Creates a new ProviderNotFoundError instance.
   *
   * @param providerName - The name or identifier of the provider that could
   *   not be found. Use the same naming convention as used in the dependency
   *   injection configuration (e.g., 'email-sender', 'payment-gateway',
   *   'storage-adapter').
   *
   * @example
   * ```typescript
   * throw new ProviderNotFoundError('smtp-transport');
   * // Message: "Provider 'smtp-transport' not found"
   *
   * throw new ProviderNotFoundError('stripe-payment-provider');
   * // Message: "Provider 'stripe-payment-provider' not found"
   * ```
   */
  constructor(providerName: string) {
    super('Provider', providerName);
    this.name = 'ProviderNotFoundError';
  }
}

/**
 * Error thrown when a message queue cannot be found.
 *
 * This specialized not-found error indicates that a required message queue
 * is not configured or registered in the queue management system. Queues are
 * used for asynchronous job processing, event distribution, and inter-service
 * communication.
 *
 * Queue not-found errors usually indicate:
 * - Queue not created or declared before use
 * - Incorrect queue name in the publish/consume operation
 * - Queue deleted or purged by external process
 * - Queue module not initialized
 *
 * @extends NotFoundError
 *
 * @example Job queue resolution failure
 * ```typescript
 * class JobDispatcher {
 *   constructor(private readonly queueManager: QueueManager) {}
 *
 *   async dispatch(queueName: string, job: Job) {
 *     const queue = this.queueManager.getQueue(queueName);
 *     if (!queue) {
 *       throw new QueueNotFoundError(queueName);
 *     }
 *     return queue.add(job);
 *   }
 * }
 * ```
 *
 * @example Event bus queue resolution
 * ```typescript
 * class EventBus {
 *   private queues = new Map<string, IQueue>();
 *
 *   publish(topic: string, event: DomainEvent) {
 *     const queue = this.queues.get(topic);
 *     if (!queue) {
 *       throw new QueueNotFoundError(topic);
 *     }
 *     return queue.publish(event);
 *   }
 * }
 * ```
 *
 * @example BullMQ queue lookup
 * ```typescript
 * async function getQueue(name: string): Promise<Queue> {
 *   const queue = await queueRegistry.get(name);
 *   if (!queue) {
 *     throw new QueueNotFoundError(name);
 *   }
 *   return queue;
 * }
 * ```
 *
 * @see {@link NotFoundError} - Parent class for all not-found errors
 * @see {@link ProviderNotFoundError} - When a service provider is not registered
 * @see {@link WorkerNotFoundError} - When a background worker is not registered
 */
export class QueueNotFoundError extends NotFoundError {
  /**
   * Creates a new QueueNotFoundError instance.
   *
   * @param queueName - The name of the queue that could not be found. Use
   *   the exact queue name as configured in the queue management system
   *   (e.g., 'email-notifications', 'order-processing', 'user-events').
   *
   * @example
   * ```typescript
   * throw new QueueNotFoundError('email-queue');
   * // Message: "Queue 'email-queue' not found"
   *
   * throw new QueueNotFoundError('payment-processing');
   * // Message: "Queue 'payment-processing' not found"
   * ```
   */
  constructor(queueName: string) {
    super('Queue', queueName);
    this.name = 'QueueNotFoundError';
  }
}

/**
 * Error thrown when a background worker cannot be found.
 *
 * This specialized not-found error indicates that a required background worker
 * is not registered or available in the worker management system. Workers are
 * used for processing jobs from queues, handling scheduled tasks, and performing
 * background operations.
 *
 * Worker not-found errors usually indicate:
 * - Worker not registered with the worker manager
 * - Worker crashed and was not restarted
 * - Incorrect worker name in the lookup
 * - Worker conditionally excluded based on environment or feature flags
 *
 * @extends NotFoundError
 *
 * @example Worker pool management
 * ```typescript
 * class WorkerPool {
 *   private workers = new Map<string, Worker>();
 *
 *   getWorker(name: string): Worker {
 *     const worker = this.workers.get(name);
 *     if (!worker) {
 *       throw new WorkerNotFoundError(name);
 *     }
 *     return worker;
 *   }
 *
 *   async stopWorker(name: string): Promise<void> {
 *     const worker = this.getWorker(name); // Throws if not found
 *     await worker.stop();
 *   }
 * }
 * ```
 *
 * @example Worker health check
 * ```typescript
 * async function checkWorkerHealth(workerName: string): Promise<HealthStatus> {
 *   const worker = workerRegistry.get(workerName);
 *   if (!worker) {
 *     throw new WorkerNotFoundError(workerName);
 *   }
 *   return worker.getHealthStatus();
 * }
 * ```
 *
 * @example Dynamic worker discovery
 * ```typescript
 * class WorkerDiscovery {
 *   async discoverWorker(capability: string): Promise<Worker> {
 *     const workers = await this.registry.findByCapability(capability);
 *     if (workers.length === 0) {
 *       throw new WorkerNotFoundError(`capability:${capability}`);
 *     }
 *     return workers[0];
 *   }
 * }
 * ```
 *
 * @see {@link NotFoundError} - Parent class for all not-found errors
 * @see {@link ProviderNotFoundError} - When a service provider is not registered
 * @see {@link QueueNotFoundError} - When a message queue is not configured
 */
export class WorkerNotFoundError extends NotFoundError {
  /**
   * Creates a new WorkerNotFoundError instance.
   *
   * @param workerName - The name or identifier of the worker that could not
   *   be found. Use the same naming convention as used in the worker
   *   registration (e.g., 'email-worker', 'report-generator', 'data-sync').
   *
   * @example
   * ```typescript
   * throw new WorkerNotFoundError('pdf-generator');
   * // Message: "Worker 'pdf-generator' not found"
   *
   * throw new WorkerNotFoundError('notification-processor');
   * // Message: "Worker 'notification-processor' not found"
   * ```
   */
  constructor(workerName: string) {
    super('Worker', workerName);
    this.name = 'WorkerNotFoundError';
  }
}
