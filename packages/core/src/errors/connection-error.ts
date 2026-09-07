import { InfrastructureError } from './infrastructure-error';

/**
 * Error thrown when a connection to an external service fails.
 *
 * This is the base class for all connection-related errors, covering network
 * failures, service communication issues, and connectivity problems with
 * external dependencies such as databases, caches, message queues, and APIs.
 *
 * Connection errors may be transient (network blip) or persistent (service down).
 * The application should implement appropriate retry strategies based on the
 * error type and service characteristics.
 *
 * **Error Hierarchy:**
 * ```
 * InfrastructureError
 * └── ConnectionError
 *     ├── AuthenticationError     (credentials rejected)
 *     └── ServiceUnavailableError (service temporarily down)
 * ```
 *
 * @example Database connection failure
 * ```typescript
 * try {
 *   await pool.connect();
 * } catch (error) {
 *   throw new ConnectionError(
 *     'PostgreSQL',
 *     'Failed to establish connection to database',
 *     error
 *   );
 * }
 * // Message: "Connection error to PostgreSQL: Failed to establish connection to database"
 * ```
 *
 * @example API endpoint unreachable
 * ```typescript
 * try {
 *   await fetch('https://api.payment-provider.com/charge');
 * } catch (error) {
 *   throw new ConnectionError(
 *     'PaymentProvider',
 *     'API endpoint unreachable',
 *     error
 *   );
 * }
 * ```
 *
 * @example Service timeout scenario
 * ```typescript
 * async function callWithTimeout<T>(
 *   service: string,
 *   operation: () => Promise<T>,
 *   timeoutMs: number
 * ): Promise<T> {
 *   const timeoutPromise = new Promise<never>((_, reject) => {
 *     setTimeout(() => {
 *       reject(new ConnectionError(service, `Connection timed out after ${timeoutMs}ms`));
 *     }, timeoutMs);
 *   });
 *   return Promise.race([operation(), timeoutPromise]);
 * }
 * ```
 *
 * @see {@link AuthenticationError} - When service credentials are rejected
 * @see {@link ServiceUnavailableError} - When a service is temporarily unavailable
 * @see {@link InfrastructureError} - Parent class providing error code and serialization
 */
export class ConnectionError extends InfrastructureError {
  /**
   * Creates a new ConnectionError instance.
   *
   * @param service - The name of the service that failed to connect. Use a
   *   consistent, identifiable name for the service (e.g., 'PostgreSQL',
   *   'Redis', 'RabbitMQ', 'Stripe API'). This name is used in error messages
   *   and should match monitoring/logging conventions.
   * @param message - A description of what went wrong with the connection.
   *   Be specific about the failure mode (e.g., 'DNS resolution failed',
   *   'Connection refused', 'SSL handshake failed', 'Socket timeout').
   * @param cause - Optional original error from the underlying connection
   *   library. Preserving this enables detailed debugging and root cause
   *   analysis (e.g., the original `pg` or `ioredis` error).
   * @param code - Optional error code for categorization. Defaults to 'CONNECTION_ERROR'.
   *   Subclasses should provide more specific codes (e.g., 'AUTHENTICATION_ERROR',
   *   'TIMEOUT_ERROR', 'NETWORK_ERROR').
   *
   * @example
   * ```typescript
   * // Network-level failure
   * throw new ConnectionError(
   *   'Redis',
   *   'Connection refused on port 6379',
   *   socketError
   * );
   *
   * // DNS failure
   * throw new ConnectionError(
   *   'Elasticsearch',
   *   'DNS lookup failed for es-cluster.internal',
   *   dnsError
   * );
   *
   * // SSL/TLS failure
   * throw new ConnectionError(
   *   'PostgreSQL',
   *   'SSL certificate verification failed',
   *   tlsError
   * );
   *
   * // Custom error code
   * throw new ConnectionError(
   *   'CustomService',
   *   'Custom connection failure',
   *   undefined,
   *   'CUSTOM_ERROR_CODE'
   * );
   * ```
   */
  constructor(
    service: string,
    message: string,
    cause?: Error | unknown,
    code: string = 'CONNECTION_ERROR'
  ) {
    super(`Connection error to ${service}: ${message}`, code, cause);
    this.name = 'ConnectionError';
  }
}

/**
 * Error thrown when authentication to an external service fails.
 *
 * This specialized connection error indicates that the service rejected the
 * provided credentials. This could be due to invalid username/password,
 * expired tokens, revoked API keys, or insufficient permissions.
 *
 * Authentication errors are generally not transient and require operator
 * intervention to resolve. The application should not retry automatically
 * as repeated authentication failures may trigger account lockouts or
 * rate limiting on the target service.
 *
 * @example Database authentication failure
 * ```typescript
 * try {
 *   await pool.connect({
 *     user: process.env.DB_USER,
 *     password: process.env.DB_PASSWORD
 *   });
 * } catch (error) {
 *   // Type-narrow unknown error before accessing properties
 *   const pgError = error as unknown;
 *   if (typeof pgError === 'object' && pgError !== null && 'code' in pgError) {
 *     const codeValue = (pgError as { code?: string }).code;
 *     if (codeValue === 'INVALID_PASSWORD') {
 *       throw new AuthenticationError('PostgreSQL', error);
 *     }
 *   }
 *   // Safe message extraction for general connection errors
 *   const message = error instanceof Error ? error.message : 'Unknown database error';
 *   throw new ConnectionError('PostgreSQL', message, error);
 * }
 * ```
 *
 * @example API authentication errors
 * ```typescript
 * const response = await fetch('https://api.stripe.com/v1/charges', {
 *   headers: { Authorization: `Bearer ${apiKey}` }
 * });
 *
 * if (response.status === 401) {
 *   throw new AuthenticationError(
 *     'Stripe',
 *     new Error(`Invalid API key: ${response.statusText}`)
 *   );
 * }
 * ```
 *
 * @example Token expiration handling
 * ```typescript
 * async function callWithAuth(service: string, request: () => Promise<Response>) {
 *   const response = await request();
 *   if (response.status === 401) {
 *     throw new AuthenticationError(service);
 *   }
 *   if (response.status === 403) {
 *     throw new AuthenticationError(
 *       service,
 *       new Error('Insufficient permissions for this operation')
 *     );
 *   }
 *   return response;
 * }
 * ```
 *
 * @see {@link ConnectionError} - Parent class for all connection errors
 * @see {@link ServiceUnavailableError} - When service is down (not auth issue)
 */
export class AuthenticationError extends ConnectionError {
  /**
   * Creates a new AuthenticationError instance.
   *
   * @param service - The name of the service that rejected authentication.
   *   Use the same naming conventions as {@link ConnectionError} for
   *   consistency in monitoring and alerting.
   * @param cause - Optional original error from the authentication attempt.
   *   May contain additional details about why authentication failed
   *   (e.g., 'invalid_grant', 'token_expired', 'bad_credentials').
   *
   * @example
   * ```typescript
   * // Simple authentication failure
   * throw new AuthenticationError('Redis');
   * // Message: "Connection error to Redis: Authentication failed. Check credentials."
   * // Error code: "AUTHENTICATION_ERROR"
   *
   * // With cause for debugging
   * throw new AuthenticationError('PostgreSQL', pgError);
   * // Cause preserved for stack trace and debugging
   * ```
   */
  constructor(service: string, cause?: Error | unknown) {
    super(service, 'Authentication failed. Check credentials.', cause, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when an external service is temporarily unavailable.
 *
 * This specialized connection error indicates that the service exists and
 * is configured correctly, but is currently unable to handle requests.
 * This typically occurs during maintenance windows, during service restarts,
 * or when the service is overloaded.
 *
 * Service unavailability errors are often transient. The application should
 * implement exponential backoff retry strategies when encountering this error,
 * as the service may recover shortly.
 *
 * @example Health check failure
 * ```typescript
 * async function checkServiceHealth(serviceName: string, healthUrl: string) {
 *   const response = await fetch(healthUrl);
 *   if (response.status === 503) {
 *     throw new ServiceUnavailableError(serviceName);
 *   }
 *   if (!response.ok) {
 *     throw new ConnectionError(serviceName, `Health check failed: ${response.status}`);
 *   }
 * }
 * ```
 *
 * @example Circuit breaker pattern
 * ```typescript
 * class CircuitBreaker {
 *   private failures = 0;
 *   private lastFailure?: Date;
 *
 *   async call<T>(service: string, operation: () => Promise<T>): Promise<T> {
 *     if (this.isOpen()) {
 *       throw new ServiceUnavailableError(service);
 *     }
 *
 *     try {
 *       const result = await operation();
 *       this.reset();
 *       return result;
 *     } catch (error) {
 *       this.recordFailure();
 *       throw new ServiceUnavailableError(service, error);
 *     }
 *   }
 * }
 * ```
 *
 * @example Service timeout with retry context
 * ```typescript
 * async function withRetry<T>(
 *   service: string,
 *   operation: () => Promise<T>,
 *   maxRetries: number
 * ): Promise<T> {
 *   for (let attempt = 1; attempt <= maxRetries; attempt++) {
 *     try {
 *       return await operation();
 *     } catch (error) {
 *       if (attempt === maxRetries) {
 *         throw new ServiceUnavailableError(service, error);
 *       }
 *       await sleep(Math.pow(2, attempt) * 100); // Exponential backoff
 *     }
 *   }
 *   throw new ServiceUnavailableError(service);
 * }
 * ```
 *
 * @see {@link ConnectionError} - Parent class for all connection errors
 * @see {@link AuthenticationError} - When credentials are rejected (not service issue)
 */
export class ServiceUnavailableError extends ConnectionError {
  /**
   * Creates a new ServiceUnavailableError instance.
   *
   * @param service - The name of the unavailable service. Use the same naming
   *   conventions as {@link ConnectionError} for consistency in monitoring
   *   and alerting dashboards.
   * @param cause - Optional original error that indicated the service is
   *   unavailable. This might be a timeout error, a connection refused error,
   *   or an HTTP 503 response error.
   *
   * @example
   * ```typescript
   * // Service is down
   * throw new ServiceUnavailableError('RabbitMQ');
   * // Message: "Connection error to RabbitMQ: Service is temporarily unavailable"
   *
   * // With underlying cause
   * throw new ServiceUnavailableError('Elasticsearch', timeoutError);
   * // Cause preserved for debugging and retry decisions
   * ```
   */
  constructor(service: string, cause?: Error | unknown) {
    super(service, 'Service is temporarily unavailable', cause, 'SERVICE_UNAVAILABLE_ERROR');
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error thrown when a network-level failure prevents communication with a service.
 *
 * This specialized connection error indicates that the failure occurred at the
 * network layer rather than at the application or service level. Common causes
 * include DNS resolution failures, connection refused errors, network timeouts,
 * and SSL/TLS handshake failures.
 *
 * Network errors are often transient and may resolve with retries. However,
 * persistent network errors may indicate infrastructure issues that require
 * operator attention.
 *
 * @example DNS resolution failure
 * ```typescript
 * try {
 *   await fetch('https://api.example.com/data');
 * } catch (error) {
 *   if (error.code === 'ENOTFOUND') {
 *     throw new NetworkError('ExampleAPI', 'DNS lookup failed', error);
 *   }
 * }
 * // Message: "Connection error to ExampleAPI: DNS lookup failed"
 * // Error code: "NETWORK_ERROR"
 * ```
 *
 * @example Connection refused
 * ```typescript
 * try {
 *   await redisClient.connect();
 * } catch (error) {
 *   if (error.code === 'ECONNREFUSED') {
 *     throw new NetworkError('Redis', 'Connection refused on port 6379', error);
 *   }
 * }
 * ```
 *
 * @example Network timeout
 * ```typescript
 * try {
 *   await axios.get('https://slow-api.com/endpoint', { timeout: 5000 });
 * } catch (error) {
 *   if (error.code === 'ETIMEDOUT') {
 *     throw new NetworkError('SlowAPI', 'Network timeout after 5000ms', error);
 *   }
 * }
 * ```
 *
 * @see {@link ConnectionError} - Parent class for all connection errors
 * @see {@link AuthenticationError} - When credentials are rejected (not network issue)
 * @see {@link ServiceUnavailableError} - When service is down (not network issue)
 */
export class NetworkError extends ConnectionError {
  /**
   * Creates a new NetworkError instance.
   *
   * @param service - The name of the service that couldn't be reached due to
   *   network failure. Use the same naming conventions as {@link ConnectionError}
   *   for consistency in monitoring and alerting.
   * @param message - A description of the network failure. Include specific
   *   network-level details (e.g., 'DNS lookup failed', 'Connection refused',
   *   'SSL handshake failed', 'Network unreachable').
   * @param cause - Optional original error from the network layer. This might
   *   be a native Node.js error with codes like ENOTFOUND, ECONNREFUSED,
   *   ETIMEDOUT, or ECONNRESET.
   *
   * @example
   * ```typescript
   * // DNS failure
   * throw new NetworkError('PostgreSQL', 'DNS lookup failed for db.internal', dnsError);
   * // Message: "Connection error to PostgreSQL: DNS lookup failed for db.internal"
   *
   * // Connection refused
   * throw new NetworkError('Redis', 'Connection refused on port 6379', connError);
   *
   * // SSL/TLS failure
   * throw new NetworkError('API', 'SSL certificate verification failed', tlsError);
   * ```
   */
  constructor(service: string, message: string, cause?: Error | unknown) {
    super(service, message, cause, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}
