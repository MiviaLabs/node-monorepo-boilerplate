/**
 * OPA Service
 *
 * HTTP client for communicating with Open Policy Agent (OPA) to obtain
 * authorization decisions. This service handles all low-level communication
 * with the OPA server, including timeout handling and error management.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
 * │  OpaGuard   │────▶│  OpaService  │────▶│  OPA Server │
 * └─────────────┘     └──────────────┘     └─────────────┘
 *                            │
 *                            ▼
 *                     HTTP POST to
 *                     /v1/data/authz/allow
 * ```
 *
 * ## Fail-Closed Security
 *
 * This service implements **fail-closed** security, meaning any error
 * during authorization (network failure, timeout, OPA error) results
 * in access being **denied**. This ensures that system failures cannot
 * be exploited to bypass authorization.
 *
 * ## OPA Communication Protocol
 *
 * The service sends a POST request to OPA's Data API:
 * - **URL**: `{opaUrl}/v1/data/authz/allow` (configurable)
 * - **Body**: `{ input: IAuthzRequest }`
 * - **Response**: `{ result: boolean, decision_id?: string }`
 *
 * @module @package/opa
 * @see {@link OpaGuard} for the guard that uses this service
 * @see {@link IAuthzRequest} for the request structure
 * @see {@link IAuthzResponse} for the response structure
 */

import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom, timeout, type Observable } from 'rxjs';

import { OpaError, OpaValidationError } from './errors';

import type { IAuthzRequest, IAuthzResponse, IOpaModuleOptions } from './types';

// Re-export OpaError for backward compatibility
export { OpaError } from './errors';

/**
 * Raw response data structure from OPA's Data API.
 *
 * @property result - The authorization decision (true = allow, false = deny)
 * @property decision_id - Optional unique identifier for this decision (for audit)
 */
interface OpaResponseData {
  result: boolean;
  decision_id?: string;
}

/**
 * HTTP client service for Open Policy Agent authorization decisions.
 *
 * This service is the core communication layer between NestJS and OPA. It:
 * - Constructs and sends authorization requests to OPA's Data API
 * - Handles timeouts to prevent hanging requests
 * - Implements fail-closed error handling
 * - Provides health checking for monitoring
 *
 * ## Usage Patterns
 *
 * ### Direct Service Usage (Programmatic)
 *
 * For cases where guard-based authorization isn't suitable:
 * ```typescript
 * @Injectable()
 * export class DocumentService {
 *   constructor(private opaService: OpaService) {}
 *
 *   async canUserAccessDocument(user: User, docId: string): Promise<boolean> {
 *     return this.opaService.isAuthorized({
 *       user: { id: user.id, system_roles: user.roles, tenant_roles: [], organization_id: user.orgId },
 *       resource: { type: 'document', id: docId },
 *       action: 'read'
 *     });
 *   }
 * }
 * ```
 *
 * ### Guard-Based Usage (Declarative)
 *
 * For controller route protection (preferred approach):
 * ```typescript
 * @UseGuards(OpaGuard)
 * @Resource('document')
 * @Action('read')
 * @Get(':id')
 * getDocument() { ... }
 * ```
 *
 * ## Configuration
 *
 * | Option | Default | Description |
 * |--------|---------|-------------|
 * | `url` | `http://localhost:8181` | OPA server base URL |
 * | `policyPath` | `/v1/data/authz/allow` | Policy document path |
 * | `timeout` | `5000` | Request timeout in milliseconds |
 *
 * @see {@link OpaGuard} for declarative authorization
 * @see {@link validateOpaConfig} for configuration validation
 */
@Injectable()
export class OpaService {
  /** Logger for debugging and audit trails */
  private readonly logger = new Logger(OpaService.name);

  /** Frozen copy of module configuration */
  private readonly config: IOpaModuleOptions;

  /**
   * Creates an OpaService instance.
   *
   * @param httpService - HTTP client for making requests (usually NestJS HttpService)
   * @param config - OPA module configuration options
   *
   * @example Creating via module configuration
   * ```typescript
   * OpaModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({
   *     url: config.get('OPA_URL', 'http://localhost:8181'),
   *     policyPath: config.get('OPA_POLICY_PATH', '/v1/data/authz/allow'),
   *     timeout: config.get('OPA_TIMEOUT', 5000),
   *   }),
   * })
   * ```
   */
  constructor(
    private readonly httpService: {
      post: (url: string, data: unknown) => Observable<{ data: OpaResponseData }>;
      get: (url: string) => Observable<unknown>;
    },
    config: IOpaModuleOptions
  ) {
    this.config = Object.freeze({ ...config });
  }

  /**
   * Checks if a user is authorized to perform an action on a resource.
   *
   * This is the primary method for obtaining authorization decisions from OPA.
   * It validates the request, queries OPA, and returns a boolean decision.
   *
   * ## Input Validation
   *
   * The request is validated before querying OPA:
   * - `user.id` must be a non-empty string
   * - `resource.type` must be a non-empty string
   * - `action` must be a non-empty string
   *
   * ## Fail-Closed Behavior
   *
   * If any error occurs (network, timeout, OPA error), this method returns
   * `false` (deny access) rather than throwing. This ensures system failures
   * cannot be exploited to bypass authorization.
   *
   * @param request - Authorization request containing user context, resource, and action
   * @returns `true` if OPA allows the action, `false` if denied or on error
   *
   * @example Complete authorization request
   * ```typescript
   * const isAllowed = await opaService.isAuthorized({
   *   user: {
   *     id: 'user-123',
   *     system_roles: ['system_admin'],
   *     tenant_roles: ['tenant_owner', 'tenant_admin'],
   *     organization_id: 'org-456',
   *     permissions: ['document:read', 'document:write'],
   *     attributes: { department: 'engineering', clearance: 'secret' }
   *   },
   *   resource: {
   *     type: 'document',
   *     id: 'doc-789',
   *     owner_id: 'user-111',
   *     organization_id: 'org-456'
   *   },
   *   action: 'update'
   * });
   *
   * if (isAllowed) {
   *   // Proceed with the action
   * } else {
   *   // Handle access denied
   * }
   * ```
   *
   * @example Minimal authorization request
   * ```typescript
   * const isAllowed = await opaService.isAuthorized({
   *   user: {
   *     id: 'user-123',
   *     system_roles: [],
   *     tenant_roles: [],
   *     organization_id: null
   *   },
   *   resource: { type: 'public_page' },
   *   action: 'read'
   * });
   * ```
   */
  async isAuthorized(request: IAuthzRequest): Promise<boolean> {
    this.validateRequest(request);

    try {
      const response = await this.queryOpa(request);
      if (typeof response.result !== 'boolean') {
        this.logger.error(
          `OPA response missing boolean result at policyPath=${this.config.policyPath}. ` +
            'Verify OPA_POLICY_PATH matches the loaded policy package.'
        );
        return false;
      }
      return response.result;
    } catch (error) {
      return this.handleAuthorizationError(error, request);
    }
  }

  /**
   * Validates the authorization request structure before sending to OPA.
   *
   * This validation prevents invalid requests from reaching OPA and provides
   * clear error messages for debugging. Validation checks:
   *
   * - `user.id` is present and is a string
   * - `resource.type` is present and is a string
   * - `action` is present and is a string
   *
   * @param request - Authorization request to validate
   * @throws {OpaValidationError} When `user.id` is missing or not a string
   * @throws {OpaValidationError} When `resource.type` is missing or not a string
   * @throws {OpaValidationError} When `action` is missing or not a string
   *
   * @example Validation failures
   * ```typescript
   * // Missing user.id
   * validateRequest({ user: {}, resource: { type: 'doc' }, action: 'read' });
   * // Throws: "Invalid authorization request: user.id is required"
   *
   * // Wrong type for action
   * validateRequest({
   *   user: { id: 'u1' },
   *   resource: { type: 'doc' },
   *   action: 123
   * });
   * // Throws: "Invalid authorization request: action must be a string"
   * ```
   */
  private validateRequest(request: IAuthzRequest): void {
    if (!request.user?.id) {
      throw new OpaValidationError('user.id is required', 'user.id');
    }

    if (!request.resource?.type) {
      throw new OpaValidationError('resource.type is required', 'resource.type');
    }

    if (!request.action) {
      throw new OpaValidationError('action is required', 'action');
    }

    if (typeof request.user.id !== 'string') {
      throw new OpaValidationError('user.id must be a string', 'user.id');
    }

    if (typeof request.resource.type !== 'string') {
      throw new OpaValidationError('resource.type must be a string', 'resource.type');
    }

    if (typeof request.action !== 'string') {
      throw new OpaValidationError('action must be a string', 'action');
    }
  }

  /**
   * Sends an authorization request to OPA's Data API.
   *
   * This method:
   * 1. Constructs the full URL: `{baseUrl}{policyPath}`
   * 2. Wraps the request in `{ input: request }` as OPA expects
   * 3. Applies the configured timeout
   * 4. Extracts and returns the response data
   *
   * ## OPA API Contract
   *
   * **Request:**
   * ```json
   * POST /v1/data/authz/allow
   * {
   *   "input": {
   *     "user": { "id": "...", ... },
   *     "resource": { "type": "...", ... },
   *     "action": "..."
   *   }
   * }
   * ```
   *
   * **Response:**
   * ```json
   * { "result": true, "decision_id": "abc-123" }
   * ```
   *
   * @param request - Validated authorization request
   * @returns Authorization response from OPA
   * @throws {OpaError} When HTTP request fails, times out, or returns non-2xx
   */
  private async queryOpa(request: IAuthzRequest): Promise<IAuthzResponse> {
    const url = `${this.config.url}${this.config.policyPath}`;

    this.logger.debug(`Querying OPA: ${url}`);
    // Log non-PII metadata only - avoid logging user IDs and attributes
    this.logger.debug(`Request: resource.type=${request.resource.type}, action=${request.action}`);

    try {
      const response$ = this.httpService.post(url, {
        input: request
      });

      // Apply timeout to the request
      const response = await firstValueFrom(
        response$.pipe(
          timeout({
            each: this.config.timeout,
            meta: true
          })
        )
      );

      const data = response.data;
      // Log decision only, not full response to avoid PII in decision metadata
      this.logger.debug(`OPA Response: result=${data.result}`);
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OpaError(`OPA request failed: ${message}`, error);
    }
  }

  /**
   * Handles authorization errors with fail-closed security behavior.
   *
   * This method ensures that **any error results in access being denied**.
   * This is critical for security: if the authorization system fails,
   * we must assume the worst and deny access rather than accidentally
   * granting it.
   *
   * ## Fail-Closed vs Fail-Open
   *
   * - **Fail-Closed (this implementation)**: Errors → Deny access
   * - **Fail-Open (DANGEROUS)**: Errors → Allow access
   *
   * Fail-closed is the secure default for authorization systems.
   *
   * ## Error Logging
   *
   * All errors are logged with:
   * - Error message and stack trace (at ERROR level)
   * - Request details (at DEBUG level for troubleshooting)
   *
   * @param error - The error that occurred (network, timeout, HTTP, etc.)
   * @param request - Original authorization request (for logging context)
   * @returns Always `false` (deny access)
   *
   * @example Error scenarios handled
   * ```typescript
   * // Network error - OPA unreachable
   * // Logged: "Authorization check failed (fail-closed): ECONNREFUSED"
   * // Returns: false
   *
   * // Timeout error - OPA too slow
   * // Logged: "Authorization check failed (fail-closed): Timeout has occurred"
   * // Returns: false
   *
   * // HTTP error - OPA returned 500
   * // Logged: "Authorization check failed (fail-closed): Request failed with status 500"
   * // Returns: false
   * ```
   */
  private handleAuthorizationError(error: unknown, request: IAuthzRequest): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.logger.error(
      `Authorization check failed (fail-closed): ${errorMessage}`,
      error instanceof Error ? error.stack : undefined
    );

    // Log non-PII metadata only - avoid logging user identifiers
    this.logger.debug(
      `Failed authorization request: resource=${request.resource.type}, action=${request.action}`
    );

    // Fail-closed: Deny access on any error
    return false;
  }

  /**
   * Checks if OPA is healthy and responding.
   *
   * Sends a GET request to OPA's `/health` endpoint. This endpoint is
   * built into OPA and returns 200 OK when the server is ready to
   * accept requests.
   *
   * ## Use Cases
   *
   * - **Health check endpoints**: Include in `/health` or `/ready` APIs
   * - **Startup probes**: Verify OPA is ready before accepting traffic
   * - **Monitoring**: Regular health checks in observability systems
   *
   * @returns `true` if OPA responds successfully, `false` on any error
   *
   * @example Health check endpoint
   * ```typescript
   * @Controller('health')
   * export class HealthController {
   *   constructor(private opaService: OpaService) {}
   *
   *   @Get()
   *   async check() {
   *     const opaHealthy = await this.opaService.healthCheck();
   *     return {
   *       status: opaHealthy ? 'healthy' : 'degraded',
   *       services: {
   *         opa: opaHealthy ? 'up' : 'down'
   *       }
   *     };
   *   }
   * }
   * ```
   *
   * @example Kubernetes readiness probe
   * ```typescript
   * @Get('ready')
   * async readinessProbe() {
   *   const opaHealthy = await this.opaService.healthCheck();
   *   if (!opaHealthy) {
   *     throw new ServiceUnavailableException('OPA not available');
   *   }
   *   return { ready: true };
   * }
   * ```
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.config.url}/health`;
      const response$ = this.httpService.get(url);
      await firstValueFrom(
        response$.pipe(
          timeout({
            each: this.config.timeout,
            meta: true
          })
        )
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `OPA health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Returns the current OPA configuration.
   *
   * The returned object is read-only (frozen) and cannot be modified.
   * Useful for debugging, logging, or displaying configuration in admin UIs.
   *
   * @returns Frozen copy of OPA module configuration
   *
   * @example Logging configuration at startup
   * ```typescript
   * @Injectable()
   * export class AppService implements OnModuleInit {
   *   constructor(private opaService: OpaService) {}
   *
   *   onModuleInit() {
   *     const config = this.opaService.getConfig();
   *     console.log(`OPA configured: ${config.url}${config.policyPath}`);
   *   }
   * }
   * ```
   */
  getConfig(): Readonly<IOpaModuleOptions> {
    return this.config;
  }
}
