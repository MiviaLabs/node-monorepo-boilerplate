# Guards Usage

Complete guide to using authentication and authorization guards in `@package/auth`.

## Overview

Guards protect routes by validating authentication and authorization. The package provides three main guards:

1. **JwtAuthGuard** - Validates JWT tokens
2. **RolesGuard** - Checks user roles
3. **PermissionsGuard** - Checks user permissions

## JwtAuthGuard

### Purpose

Validates JWT tokens on protected routes.

### Basic Usage

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@package/auth';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get('profile')
  getProfile() {
    // Protected route - requires valid JWT
    return { message: 'This is protected' };
  }
}
```

### Guard-Level Application

```typescript
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get('profile')
  getProfile() {
    return { message: 'Protected' };
  }

  @Get('settings')
  getSettings() {
    return { message: 'Also protected' };
  }
}
```

### Method-Level Application

```typescript
@Controller('users')
export class UsersController {
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile() {
    return { message: 'Protected' };
  }

  @Get('public')
  getPublic() {
    return { message: 'Public' };
  }
}
```

### With Public Routes

```typescript
import { Public } from '@package/auth';

@Controller('auth')
@UseGuards(JwtAuthGuard) // All routes protected by default
export class AuthController {
  @Public() // Override - make this route public
  @Post('login')
  login() {
    return { message: 'Public route' };
  }

  @Get('me')
  getMe() {
    return { message: 'Protected route' };
  }
}
```

## RolesGuard

### Purpose

Checks if authenticated users have required roles.

### Basic Usage

```typescript
import { Controller, Delete, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@package/auth';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Roles('admin')
  @Delete('users/:id')
  deleteUser() {
    return { message: 'Only admins can delete users' };
  }
}
```

### Multiple Roles

```typescript
@Roles('admin', 'moderator')
@Delete('users/:id')
deleteUser() {
  // Users with 'admin' OR 'moderator' role can access
}
```

### Guard Configuration

```typescript
// In auth module setup
AuthModule.forRoot({
  // ... other config
  enableRoles: true, // Must be enabled
}),
```

### Role Format

Roles are extracted from JWT token:

```typescript
// JWT payload
{
  "sub": "user-123",
  "tenant_id": "tenant-456",
  "roles": ["admin", "user"], // Array of roles
  "permissions": ["users:write", "users:read"]
}
```

## PermissionsGuard

### Purpose

Checks if authenticated users have required permissions.

### Basic Usage

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@package/auth';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  @RequirePermissions('users:write')
  @Post()
  createUser() {
    return { message: 'Only users with users:write permission' };
  }
}
```

### Multiple Permissions

```typescript
@RequirePermissions('users:write', 'users:delete')
@Delete('users/:id')
deleteUser() {
  // User must have ALL permissions (AND logic)
}
```

### Guard Configuration

```typescript
// In auth module setup
AuthModule.forRoot({
  // ... other config
  enablePermissions: true, // Must be enabled
}),
```

### Permission Format

Permissions are extracted from JWT token:

```typescript
// JWT payload
{
  "sub": "user-123",
  "tenant_id": "tenant-456",
  "roles": ["admin"],
  "permissions": ["users:write", "users:read", "posts:write"]
}
```

## Combining Guards

### Full Stack

```typescript
@Controller('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AdminController {
  @Get('users')
  @Roles('admin')
  listUsers() {
    return { message: 'Admin only' };
  }

  @Delete('users/:id')
  @Roles('admin')
  @RequirePermissions('users:delete')
  deleteUser() {
    return { message: 'Admin with users:delete permission' };
  }
}
```

### Execution Order

Guards are executed in order:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
```

1. JwtAuthGuard validates token
2. RolesGuard checks roles
3. PermissionsGuard checks permissions

If any guard fails, subsequent guards are not executed.

## Global Guard

### Enable Global Guard

```typescript
// In auth module setup
AuthModule.forRoot({
  // ... other config
  globalAuthGuard: true, // Protect all routes by default
}),
```

### Override with @Public()

```typescript
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  healthCheck() {
    return { status: 'ok' };
  }
}
```

### Configure in main.ts

```typescript
import { Reflector } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const reflector = app.get(Reflector);

  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new RolesGuard(reflector),
    new PermissionsGuard(reflector)
  );

  await app.listen(3000);
}
bootstrap();
```

## Custom Guards

### Extend JwtAuthGuard

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '@package/auth';

@Injectable()
export class CustomAuthGuard extends JwtAuthGuard {
  constructor(reflector: Reflector) {
    super(reflector);
  }

  canActivate(context: ExecutionContext) {
    // Custom logic before JWT validation
    const request = context.switchToHttp().getRequest();
    console.log('Authenticating request:', request.url);

    return super.canActivate(context);
  }
}
```

### Tenant-Specific Guard

```typescript
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantService: TenantService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-organization-id'];
    const user = request.user;

    // Verify user belongs to tenant
    return await this.tenantService.userBelongsToTenant(user.id, tenantId);
  }
}

// Usage
@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UsersController {
  // ...
}
```

## Error Handling

### Custom Error Messages

```typescript
@Injectable()
export class CustomRolesGuard extends RolesGuard {
  constructor(reflector: Reflector) {
    super(reflector);
  }

  handleRoleError(userRoles: string[], requiredRoles: string[]) {
    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLES',
      message: `Required roles: ${requiredRoles.join(', ')}`,
      yourRoles: userRoles
    });
  }
}
```

### Logging Failed Attempts

```typescript
@Injectable()
export class LoggingAuthGuard extends JwtAuthGuard {
  constructor(
    reflector: Reflector,
    private readonly logger: Logger
  ) {
    super(reflector);
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    return super.canActivate(context).catch((error) => {
      this.logger.warn(`Auth failed for ${request.url}: ${error.message}`);
      throw error;
    });
  }
}
```

## Best Practices

1. **Use @Public() decorator** - Explicitly mark public routes
2. **Combine guards** - Use JwtAuthGuard + RolesGuard + PermissionsGuard
3. **Apply guards at controller level** - Protect all endpoints by default
4. **Use specific roles/permissions** - Avoid overly permissive access
5. **Log failed attempts** - Track unauthorized access attempts
6. **Test guards** - Write unit tests for guard logic
7. **Document protected routes** - Use OpenAPI decorators

## OpenAPI Documentation

```typescript
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('users')
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get('profile')
  @ApiOperation({ summary: 'Get user profile', description: 'Requires authentication' })
  getProfile() {
    return {};
  }
}
```

## Testing Guards

### Unit Test

```typescript
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '@package/auth';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [JwtAuthGuard]
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  it('should allow valid token', async () => {
    const context = createMockExecutionContext({
      headers: { authorization: 'Bearer valid-token' }
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });
});
```

### E2E Test

```typescript
describe('Auth Guards (e2e)', () => {
  it('should protect route without token', () => {
    return request(app.getHttpServer()).get('/users/profile').expect(401);
  });

  it('should allow access with valid token', () => {
    const token = generateValidToken();

    return request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
```

## Next Steps

- [Decorators Reference](./decorators.md) - @Public, @Roles, @RequirePermissions, @User
- [Multi-Tenancy](./multi-tenancy.md) - Tenant context in guards
