/**
 * @package/opa
 *
 * Open Policy Agent (OPA) integration for NestJS, providing fine-grained,
 * policy-based authorization with enterprise-grade security features.
 *
 * ## Features
 *
 * - **OPA HTTP Client**: Service for querying OPA authorization decisions
 * - **Authorization Guards**: {@link OpaGuard} and {@link OpaCachedGuard} for route protection
 * - **Declarative Authorization**: {@link Resource} and {@link Action} decorators
 * - **Fail-Closed Security**: Denies access on errors for secure defaults
 * - **Input Validation**: Validates all authorization requests
 * - **Timeout Handling**: Configurable timeout for OPA queries
 * - **Caching Support**: In-memory cache with TTL for high-traffic endpoints
 *
 * ## Architecture: Guard → Decorator → Service Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        HTTP Request                             │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  1. JwtAuthGuard (or other auth)                                │
 * │     - Extracts JWT/session                                      │
 * │     - Populates request.user                                    │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  2. OpaGuard                                                    │
 * │     - Reads @Resource() and @Action() metadata via Reflector    │
 * │     - Extracts user context from request.user                   │
 * │     - Builds IAuthzRequest                                      │
 * │     - Calls OpaService.isAuthorized()                           │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  3. OpaService                                                  │
 * │     - Validates IAuthzRequest                                   │
 * │     - POST to OPA: {opaUrl}/v1/data/authz/allow                 │
 * │     - Body: { input: IAuthzRequest }                            │
 * │     - Returns boolean or fails closed                           │
 * └─────────────────────────────────────────────────────────────────┘
 *                                 │
 *                                 ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  4. OPA Server (external)                                       │
 * │     - Evaluates Rego policy                                     │
 * │     - Returns { result: true/false }                            │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Three-Tier Policy Organization
 *
 * This package is designed to work with a structured policy organization:
 *
 * ```
 * policies/
 * ├── raw/                  # Source Rego files
 * │   └── authz/
 * │       ├── main.rego     # Main authorization rules
 * │       ├── rbac.rego     # Role-based rules
 * │       └── abac.rego     # Attribute-based rules
 * │
 * ├── docs/                 # Human-readable documentation
 * │   └── authz/
 * │       └── README.md     # Policy explanations
 * │
 * └── ai/                   # Machine-parseable metadata
 *     └── authz.json        # Policy structure for AI tools
 * ```
 *
 * ## Module Setup
 *
 * ```typescript
 * import { Module } from '@nestjs/common';
 * import { OpaModule } from '@package/opa';
 * import { ConfigModule, ConfigService } from '@nestjs/config';
 *
 * @Module({
 *   imports: [
 *     OpaModule.forRootAsync({
 *       imports: [ConfigModule],
 *       inject: [ConfigService],
 *       useFactory: (config: ConfigService) => ({
 *         url: config.get('OPA_URL', 'http://localhost:8181'),
 *         policyPath: config.get('OPA_POLICY_PATH', '/v1/data/authz/allow'),
 *         timeout: config.get('OPA_TIMEOUT', 5000),
 *       }),
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ## Protecting Routes
 *
 * ```typescript
 * import { Controller, Get, Post, Patch, Delete, UseGuards, Param, Body } from '@nestjs/common';
 * import { OpaGuard, Resource, Action } from '@package/opa';
 * import { JwtAuthGuard } from './auth/jwt-auth.guard';
 *
 * @Controller('organizations')
 * @UseGuards(JwtAuthGuard, OpaGuard)  // Auth first, then authorization
 * @Resource('organization')           // Default resource for all methods
 * export class OrganizationsController {
 *
 *   @Get()
 *   @Action('list')
 *   findAll() {
 *     return this.organizationService.findAll();
 *   }
 *
 *   @Get(':id')
 *   @Action('read')
 *   findOne(@Param('id') id: string) {
 *     return this.organizationService.findOne(id);
 *   }
 *
 *   @Post()
 *   @Action('create')
 *   create(@Body() dto: CreateOrganizationDto) {
 *     return this.organizationService.create(dto);
 *   }
 *
 *   @Patch(':id')
 *   @Action('update')
 *   update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
 *     return this.organizationService.update(id, dto);
 *   }
 *
 *   @Delete(':id')
 *   @Action('delete')
 *   remove(@Param('id') id: string) {
 *     return this.organizationService.remove(id);
 *   }
 * }
 * ```
 *
 * ## Corresponding Rego Policy
 *
 * ```rego
 * package authz
 *
 * default allow = false
 *
 * # System admins can do anything
 * allow {
 *   input.user.system_roles[_] == "system_admin"
 * }
 *
 * # Users can read resources in their organization
 * allow {
 *   input.action == "read"
 *   input.user.organization_id == input.resource.organization_id
 * }
 *
 * # Tenant admins can manage their organization
 * allow {
 *   input.action in ["create", "update", "delete"]
 *   input.user.tenant_roles[_] == "tenant_admin"
 *   input.user.organization_id == input.resource.organization_id
 * }
 * ```
 *
 * @see {@link OpaGuard} for basic route protection
 * @see {@link OpaCachedGuard} for cached authorization
 * @see {@link Resource} for resource type decoration
 * @see {@link Action} for action decoration
 * @see {@link OpaService} for direct service usage
 * @see `@package/auth` for authentication guard integration
 * @see `@package/redis` for authorization cache backend
 *
 * @packageDocumentation
 */

// ============================================================================
// Module
// ============================================================================

/**
 * The main NestJS module for OPA integration.
 * Use `OpaModule.forRoot()` or `OpaModule.forRootAsync()` to configure.
 */
export { OpaModule } from './opa.module';

// ============================================================================
// Service
// ============================================================================

/**
 * The core OPA communication service.
 * Inject this for programmatic authorization checks.
 */
export { OpaService } from './opa.service';

/**
 * Error classes for OPA-related failures.
 * @see {@link OpaError} for general OPA communication errors
 * @see {@link OpaConfigError} for configuration validation errors
 * @see {@link OpaValidationError} for request validation errors
 */
export { OpaError, OpaConfigError, OpaValidationError } from './errors';

// ============================================================================
// Guards
// ============================================================================

/**
 * Authorization guards for route protection.
 * @see {@link OpaGuard} for standard authorization
 * @see {@link OpaCachedGuard} for cached authorization (high-traffic endpoints)
 */
export { OpaGuard, OpaCachedGuard } from './guards';

// ============================================================================
// Decorators
// ============================================================================

/**
 * Metadata decorators for declarative authorization.
 * @see {@link Resource} for specifying resource types
 * @see {@link Action} for specifying actions
 */
export { Resource, Action } from './decorators';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration types for module setup.
 * @see {@link IOpaModuleOptions} for sync configuration
 * @see {@link IOpaModuleAsyncOptions} for async configuration
 */
export type {
  IOpaModuleOptions,
  IOpaModuleAsyncOptions,
  OpaModuleOptions,
  OpaModuleAsyncOptions
} from './types/opa.types';

/**
 * Authorization request/response types.
 * @see {@link IAuthzRequest} for OPA input structure
 * @see {@link IAuthzResponse} for OPA output structure
 */
export type { IAuthzRequest, IAuthzResponse, AuthzRequest, AuthzResponse } from './types/opa.types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration utilities and defaults.
 * @see {@link DEFAULT_OPA_CONFIG} for default values
 * @see {@link OPA_ENV_VARS} for environment variable names
 * @see {@link validateOpaConfig} for configuration validation
 * @see {@link opaConfigFromEnv} for environment-based configuration
 */
export {
  DEFAULT_OPA_CONFIG,
  OPA_ENV_VARS,
  validateOpaConfig,
  opaConfigFromEnv
} from './config/opa.config';
