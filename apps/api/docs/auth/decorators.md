# Decorators Reference

Complete reference for all decorators provided by `@package/auth`.

## Overview

Decorators provide a declarative way to control authentication, authorization, and extract user context from requests.

## @Public()

### Purpose

Mark a route as public (no authentication required).

### Usage

```typescript
import { Controller, Post } from '@nestjs/common';
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

### When to Use

- Login/registration endpoints
- Health check endpoints
- Public API documentation
- Webhook endpoints
- Password reset endpoints

### Notes

- Overrides global JwtAuthGuard
- Works with guard-level and controller-level guards
- Must be used before route handler

## @Roles(...roles: string[])

### Purpose

Require specific roles to access a route.

### Usage

```typescript
import { Controller, Delete, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@package/auth';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Roles('admin')
  @Delete('users/:id')
  deleteUser() {
    return { message: 'Admin only' };
  }

  @Roles('admin', 'moderator')
  @Post('announcements')
  createAnnouncement() {
    return { message: 'Admin or moderator' };
  }
}
```

### Multiple Roles

```typescript
@Roles('admin', 'moderator', 'superadmin')
@Delete('users/:id')
deleteUser() {
  // User must have at least one of the roles (OR logic)
}
```

### Role Format

Roles are extracted from JWT token:

```typescript
// JWT payload
{
  "roles": ["admin", "user"]
}
```

### When to Use

- Admin-only endpoints
- Moderator-only endpoints
- Role-based feature access
- Hierarchical permissions

### Notes

- Requires RolesGuard to be applied
- Uses OR logic (user needs at least one role)
- Roles are case-sensitive
- Must be used with @UseGuards(JwtAuthGuard, RolesGuard)

## @RequirePermissions(...permissions: string[])

### Purpose

Require specific permissions to access a route.

### Usage

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@package/auth';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  @RequirePermissions('users:write')
  @Post()
  createUser() {
    return { message: 'Requires users:write permission' };
  }

  @RequirePermissions('users:write', 'users:delete')
  @Delete('users/:id')
  deleteUser() {
    return { message: 'Requires both permissions' };
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

### Permission Format

Permissions follow `resource:action` format:

```typescript
// JWT payload
{
  "permissions": [
    "users:read",
    "users:write",
    "users:delete",
    "posts:read",
    "posts:write"
  ]
}
```

### Common Permissions

| Permission     | Description           |
| -------------- | --------------------- |
| `users:read`   | Read user data        |
| `users:write`  | Create/update users   |
| `users:delete` | Delete users          |
| `posts:read`   | Read posts            |
| `posts:write`  | Create/update posts   |
| `posts:delete` | Delete posts          |
| `admin:*`      | All admin permissions |

### When to Use

- Fine-grained access control
- Feature-specific permissions
- Resource-specific operations
- Action-level authorization

### Notes

- Requires PermissionsGuard to be applied
- Uses AND logic (user needs all permissions)
- Permissions are case-sensitive
- Must be used with @UseGuards(JwtAuthGuard, PermissionsGuard)

## @User(field?: string)

### Purpose

Extract the authenticated user from the request.

### Usage

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, User } from '@package/auth';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get('profile')
  getProfile(@User() user: any) {
    return user;
    // Returns full user object from JWT
  }
}
```

### Extract Specific Field

```typescript
@Get('email')
getEmail(@User('email') email: string) {
  return { email };
  // Returns only the email field
}

@Get('roles')
getRoles(@User('roles') roles: string[]) {
  return { roles };
  // Returns only the roles array
}
```

### Available Fields

```typescript
interface UserPayload {
  sub: string; // User ID
  tenant_id: string; // Tenant ID
  actor_id: string; // Actor ID
  email: string; // User email
  name: string; // User name
  roles: string[]; // User roles
  permissions: string[]; // User permissions
  iat: number; // Issued at
  exp: number; // Expiration
}
```

### When to Use

- Get current user information
- Access user properties
- Log user actions
- Personalize responses

### Notes

- Requires JwtAuthGuard to be applied
- Returns full user object if no field specified
- Returns specific field if field parameter provided
- User object comes from JWT payload

## @TenantId()

### Purpose

Extract the tenant ID from the JWT token.

### Usage

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, TenantId } from '@package/auth';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  @Get()
  getPosts(@TenantId() tenantId: string) {
    // Use tenantId for tenant-scoped queries
    return this.postsService.findByTenant(tenantId);
  }
}
```

### With Repository

```typescript
@Get(':id')
findOne(@Param('id') id: string, @TenantId() tenantId: string) {
  return this.postsRepository.findOne(tenantId, id);
}
```

### When to Use

- Tenant-scoped database queries
- Tenant-prefixed cache keys
- Tenant-specific operations
- Multi-tenant data isolation

### Notes

- Requires JwtAuthGuard to be applied
- Tenant ID must be present in JWT token
- Always include tenantId in database queries
- Use for tenant isolation

## @ActorId()

### Purpose

Extract the actor ID from the JWT token (useful for audit trails).

### Usage

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, ActorId } from '@package/auth';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  @Post()
  createPost(@Body() dto: CreatePostDto, @ActorId() actorId: string) {
    return this.postsService.create(dto, actorId);
  }
}
```

### With Command Bus

```typescript
@Post()
async createPost(@Body() dto: CreatePostDto, @TenantId() tenantId: string, @ActorId() actorId: string) {
  const command = new CreatePostCommand({
    tenantId,
    actorId,
    ...dto,
  });

  return this.commandBus.execute(command);
}
```

### When to Use

- Audit logging
- Track who performed actions
- Command handlers
- Event sourcing

### Notes

- Requires JwtAuthGuard to be applied
- Actor ID is typically the user ID
- Use for audit trails
- Track "who did what"

## Combining Decorators

### Multiple Decorators

```typescript
@Controller('posts')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PostsController {
  @Post()
  @Roles('admin', 'editor')
  @RequirePermissions('posts:write')
  createPost(
    @Body() dto: CreatePostDto,
    @TenantId() tenantId: string,
    @ActorId() actorId: string,
    @User('email') email: string
  ) {
    return this.postsService.create({
      ...dto,
      tenantId,
      actorId,
      creatorEmail: email
    });
  }
}
```

### Example: Full Stack

```typescript
@Controller('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  @Get('profile')
  @ApiOperation({ summary: 'Get user profile' })
  getProfile(@User() user: any) {
    return user;
  }

  @Put('profile')
  @RequirePermissions('users:write')
  updateProfile(
    @Body() dto: UpdateUserDto,
    @TenantId() tenantId: string,
    @ActorId() actorId: string
  ) {
    return this.usersService.update(tenantId, actorId, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @RequirePermissions('users:delete')
  deleteUser(
    @Param('id') userId: string,
    @TenantId() tenantId: string,
    @ActorId() actorId: string
  ) {
    return this.usersService.delete(tenantId, userId, actorId);
  }
}
```

## Custom Decorators

### Create Custom Decorator

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UserEmail = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.email;
  },
);

// Usage
@Get()
findByEmail(@UserEmail() email: string) {
  return this.usersService.findByEmail(email);
}
```

### Tenant Verification Decorator

```typescript
export const TenantMatch = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const userTenantId = request.user?.tenant_id;
  const headerTenantId = request.headers['x-organization-id'];

  if (userTenantId !== headerTenantId) {
    throw new ForbiddenException('Tenant mismatch');
  }

  return userTenantId;
});
```

## Best Practices

1. **Use @User() for user data** - Extract user information cleanly
2. **Always use @TenantId()** - Ensure tenant isolation
3. **Use @ActorId() for audit trails** - Track who performed actions
4. **Combine decorators** - Use multiple decorators for complex scenarios
5. **Document decorator usage** - Add JSDoc comments
6. **Test decorators** - Write unit tests for custom decorators

## Testing

### Test Controllers with Decorators

```typescript
describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService]
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should extract user from request', () => {
    const mockUser = { id: '123', email: 'test@example.com' };
    const result = controller.getProfile(mockUser);
    expect(result).toEqual(mockUser);
  });
});
```

### Mock Decorators in Tests

```typescript
// Mock @User() decorator
jest.mock('@package/auth', () => ({
  ...jest.requireActual('@package/auth'),
  User: () =>
    jest.fn().mockImplementation((data) => {
      return (target: any, propertyKey: string, parameterIndex: number) => {
        // Mock implementation
      };
    })
}));
```

## Next Steps

- [Guards Usage](./guards.md) - How to use guards with decorators
- [Multi-Tenancy](./multi-tenancy.md) - Tenant context in decorators
