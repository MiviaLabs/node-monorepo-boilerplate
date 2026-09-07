# @package/opa

Enterprise-grade Open Policy Agent (OPA) integration for NestJS with fine-grained policy-based authorization, fail-closed security, and in-memory decision caching.

## Purpose

This package provides production-ready authorization infrastructure through Open Policy Agent integration. It enables declarative, policy-based access control with fail-closed security, strict input validation, configurable timeouts, and high-performance caching for latency-sensitive endpoints.

## Structure

```text
src/
├── config/
│   └── opa.config.ts        # Configuration utilities and defaults
├── decorators/
│   ├── action.decorator.ts  # @Action() decorator
│   └── resource.decorator.ts # @Resource() decorator
├── guards/
│   ├── opa.guard.ts         # Standard authorization guard
│   └── opa-cached.guard.ts  # Cached authorization guard
├── types/
│   └── opa.types.ts         # Type definitions
├── errors.ts                # OPA-specific error classes
├── opa.module.ts            # NestJS dynamic module
├── opa.service.ts           # Core OPA HTTP client service
└── index.ts                 # Barrel exports
```

## Usage

```typescript
import { Module, Controller, Get, UseGuards } from '@nestjs/common';
import { OpaModule, OpaGuard, Resource, Action } from '@package/opa';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Module setup
@Module({
  imports: [
    OpaModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.get('OPA_URL', 'http://localhost:8181'),
        policyPath: config.get('OPA_POLICY_PATH', '/v1/data/authz/allow'),
        timeout: config.get('OPA_TIMEOUT', 5000)
      })
    })
  ]
})
export class AppModule {}

// Route protection (assumes JwtAuthGuard and OrganizationsService are imported elsewhere)
@Controller('organizations')
@UseGuards(JwtAuthGuard, OpaGuard)
@Resource('organization')
export class OrganizationsController {
  constructor(private readonly organizationService: OrganizationsService) {}

  @Get()
  @Action('list')
  findAll() {
    return this.organizationService.findAll();
  }

  @Get(':id')
  @Action('read')
  findOne(@Param('id') id: string) {
    return this.organizationService.findOne(id);
  }
}
```

## Key Exports

### Module

- `OpaModule` - NestJS dynamic module with `forRootAsync()` configuration

### Guards

- `OpaGuard` - Standard authorization guard for route protection
- `OpaCachedGuard` - Cached authorization guard for high-traffic endpoints

### Decorators

- `@Resource(type)` - Specifies resource type for authorization
- `@Action(action)` - Specifies action for authorization

### Service

- `OpaService` - Core OPA HTTP client for programmatic authorization checks

### Configuration

- `DEFAULT_OPA_CONFIG` - Default configuration values
- `OPA_ENV_VARS` - Environment variable names (`OPA_URL`, `OPA_POLICY_PATH`, `OPA_TIMEOUT`)
- `validateOpaConfig()` - Configuration validation function
- `opaConfigFromEnv()` - Environment-based configuration factory

### Errors

- `OpaError` - General OPA communication errors
- `OpaConfigError` - Configuration validation errors
- `OpaValidationError` - Request validation errors

### Types

- `IOpaModuleOptions` - Module configuration interface
- `IOpaModuleAsyncOptions` - Async module configuration interface
- `IAuthzRequest` - Authorization request structure
- `IAuthzResponse` - Authorization response structure

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |
