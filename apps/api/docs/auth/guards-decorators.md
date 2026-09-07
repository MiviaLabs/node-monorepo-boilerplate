# Authentication Guards and Decorators

## Table of Contents

1. [Overview](#overview)
2. [Guards](#guards)
3. [Decorators](#decorators)
4. [Usage Patterns](#usage-patterns)
5. [Custom Guards](#custom-guards)
6. [Testing Guards](#testing-guards)
7. [Best Practices](#best-practices)

---

## Overview

The authentication system provides **guards** for protecting routes and **decorators** for extracting user/tenant context from requests.

### Architecture Flow

```
┌────────────────────────────────────────────────────────────┐
│                    Incoming Request                        │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│            @Public() Decorator Check                       │
│  - If @Public(), skip all guards                           │
│  - Otherwise, proceed to authentication                    │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│                JwtAuthGuard                                │
│  - Extract Bearer token from Authorization header          │
│  - Verify JWT signature with JwtService                    │
│  - Check token expiration                                  │
│  - Attach user payload to request.user                     │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│             TenantMiddleware                               │
│  - Extract x-tenant-id header                              │
│  - Validate tenant UUID format                             │
│  - Attach tenant context to request                        │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│          Authorization Guards (Optional)                   │
│  - CanDeleteUserGuard                                      │
│  - RolesGuard                                              │
│  - Custom feature guards                                   │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│             Controller Handler                             │
│  - Access user via @CurrentUser()                          │
│  - Access tenant via @TenantId() or @TenantContext()       │
└────────────────────────────────────────────────────────────┘
```

---

## Guards

### JwtAuthGuard

The primary authentication guard that validates JWT tokens.

#### Location

`apps/api/src/modules/auth/guards/jwt-auth.guard.ts`

#### Implementation

```typescript
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * JWT Authentication Guard
 *
 * Extends NestJS Passport JWT guard with public route support
 * Allows marking routes as @Public() to bypass authentication
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true; // Skip authentication
    }

    // For non-public routes, verify JWT manually for better error messages
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request as Request);

    if (!token) {
      throw new UnauthorizedException('Access token is missing');
    }

    try {
      // Verify token and attach user to request
      const payload = this.jwtService.verify(token);
      (request as Record<string, unknown>).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /**
   * Extract Bearer token from Authorization header
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const headers = (request as unknown as Record<string, Record<string, string>>).headers;
    const authorization = headers?.authorization;
    if (!authorization) {
      return undefined;
    }
    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
```

#### Usage

```typescript
// Protect entire controller
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  @Get()
  findAll(@CurrentUser() user: CurrentUserData) {
    return this.usersService.findAll(user.tenantId);
  }
}

// Protect specific route
@Controller('products')
export class ProductsController {
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.productsService.findAll();
  }

  @Get('public')
  @Public() // Override guard for public route
  getPublicProducts() {
    return this.productsService.getPublic();
  }
}
```

#### Features

- ✅ **Public route support**: Routes marked with `@Public()` skip authentication
- ✅ **Clear error messages**: Distinguishes between missing token and invalid token
- ✅ **Request decoration**: Attaches JWT payload to `request.user`
- ✅ **Bearer token extraction**: Extracts from `Authorization: Bearer <token>` header

### CanDeleteUserGuard

Authorization guard that validates user deletion permissions.

#### Location

`apps/api/src/modules/auth/guards/can-delete-user.guard.ts`

#### Implementation

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Errors } from '@package/errors';

import type { CurrentUserData } from '@/common/decorators/current-user.decorator';

/**
 * Guard to check if user can delete an account
 *
 * Allows:
 * - Admin users to delete any account in their tenant
 * - Users to delete their own account
 */
@Injectable()
export class CanDeleteUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & {
        user?: CurrentUserData;
        params: { id: string };
      }
    >();

    const user = request.user;
    const targetUserId = request.params.id;

    if (!user) {
      throw Errors.authinvalidEmailOr001({});
    }

    // Check if user is admin
    const isAdmin = user.roles?.includes('admin');

    // Allow if admin or deleting own account
    if (isAdmin || user.userId.toString() === targetUserId) {
      return true;
    }

    throw Errors.authinsufficientPermissionsRequiredpermission004({
      requiredPermission: 'users:delete'
    });
  }
}
```

#### Usage

```typescript
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Delete(':id')
  @UseGuards(CanDeleteUserGuard)
  async deleteUser(@Param('id') userId: string, @CurrentUser() user: CurrentUserData) {
    return this.commandBus.execute(
      new DeleteUserCommand({
        tenantId: user.tenantId,
        userId: Number(userId),
        actorId: String(user.userId)
      })
    );
  }
}
```

#### Authorization Rules

| User Type        | Can Delete Own Account | Can Delete Other Accounts |
| ---------------- | ---------------------- | ------------------------- |
| **Admin**        | ✅ Yes                 | ✅ Yes (within tenant)    |
| **Regular User** | ✅ Yes                 | ❌ No                     |
| **Anonymous**    | ❌ No                  | ❌ No                     |

### Authorization Guards

#### RolesGuard

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const hasRole = requiredRoles.some(role => user.roles?.includes(role));

    if (!hasRole) {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: requiredRoles.join(', '),
      });
    }

    return true;
  }
}

// Usage
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'moderator')
@Get('admin/dashboard')
getAdminDashboard() {
  return this.dashboardService.getAdminData();
}
```

#### PermissionsGuard

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler()
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const hasPermission = requiredPermissions.every(permission =>
      user.permissions?.includes(permission)
    );

    if (!hasPermission) {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: requiredPermissions.join(', '),
      });
    }

    return true;
  }
}

// Usage
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('users:delete', 'users:manage')
@Delete('users/:id')
deleteUser(@Param('id') userId: string) {
  return this.usersService.delete(userId);
}
```

---

## Decorators

### @Public()

Marks a route as public, bypassing all authentication guards.

#### Location

`apps/api/src/modules/auth/guards/public.decorator.ts`

#### Implementation

````typescript
import { SetMetadata } from '@nestjs/common';

/**
 * Public route metadata key
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Public decorator
 *
 * Marks a route as public (no authentication required)
 * Use this to bypass JWT authentication guards
 *
 * @example
 * ```typescript
 * @Public()
 * @Post('login')
 * async login() {
 *   // Public endpoint
 * }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
````

#### Usage

```typescript
@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('logout') // Not public, requires authentication
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: CurrentUserData) {
    return this.authService.logout(user.userId);
  }
}
```

### @CurrentUser()

Extracts the authenticated user from the request.

#### Location

`apps/api/src/common/decorators/current-user.decorator.ts`

#### Implementation

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Current user decorator
 *
 * Extracts the authenticated user from the request object
 * Works with JwtAuthGuard to populate req.user
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserData }>();
    const user = request.user;

    if (!user) {
      throw new Error('User not found in request. Ensure JwtAuthGuard is applied.');
    }

    return user;
  }
);

/**
 * Current user data interface
 * Extracted from JWT payload by JwtAuthGuard
 */
export interface CurrentUserData {
  readonly userId: number;
  readonly tenantId: string;
  readonly email?: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}
```

#### Usage

```typescript
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  @Get()
  getProfile(@CurrentUser() user: CurrentUserData) {
    console.log('User ID:', user.userId);
    console.log('Tenant ID:', user.tenantId);
    console.log('Email:', user.email);
    console.log('Roles:', user.roles);

    return this.profileService.getProfile(user.tenantId, user.userId);
  }

  @Put()
  updateProfile(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateProfileDto) {
    return this.profileService.update(user.tenantId, user.userId, dto);
  }
}
```

### @TenantId()

Extracts only the tenant ID from the request context.

#### Location

`apps/api/src/common/decorators/tenant.decorator.ts`

#### Implementation

````typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiException } from '../errors';

/**
 * Decorator to inject tenant ID into controller methods
 *
 * @example
 * ```typescript
 * @Post()
 * async create(@TenantId() tenantId: string, @Body() dto: CreateDto) {
 *   // tenantId is string
 * }
 * ```
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithTenantContext>();

  // ONLY check request.tenantContext (set by middleware)
  if (request.tenantContext?.tenantId) {
    return request.tenantContext.tenantId;
  }

  // If request.tenantContext is not set, tenant header was missing or invalid
  throw ApiException.missingRequiredHeader('x-tenant-id');
});
````

#### Usage

```typescript
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.queryBus.execute(new ListProductsQuery(tenantId));
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') productId: string) {
    return this.queryBus.execute(new GetProductQuery(tenantId, productId));
  }
}
```

### @TenantContext()

Extracts the full tenant context (tenant ID, slug, user info) from the request.

#### Location

`apps/api/src/common/decorators/tenant.decorator.ts`

#### Implementation

````typescript
/**
 * Tenant context interface
 */
interface TenantContext {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly userId?: string;
  readonly userRoles?: readonly string[];
}

/**
 * Decorator to inject tenant context into controller methods
 *
 * @example
 * ```typescript
 * @Post()
 * async create(@TenantContext() tenant: TenantContext, @Body() dto: CreateDto) {
 *   console.log(tenant.tenantId);
 * }
 * ```
 */
export const TenantContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenantContext>();

    // ONLY check request.tenantContext (set by middleware)
    if (request.tenantContext) {
      return request.tenantContext;
    }

    // If request.tenantContext is not set, tenant header was missing or invalid
    throw ApiException.missingRequiredHeader('x-tenant-id');
  }
);
````

#### Usage

```typescript
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  @Post()
  async create(
    @TenantContext() tenant: TenantContext,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateOrderDto
  ) {
    console.log('Tenant ID:', tenant.tenantId);
    console.log('Tenant Slug:', tenant.tenantSlug);
    console.log('User Roles:', tenant.userRoles);

    const command = new CreateOrderCommand({
      tenantId: tenant.tenantId,
      actorId: String(user.userId),
      ...dto
    });

    return this.commandBus.execute(command);
  }
}
```

---

## Usage Patterns

### Pattern 1: Public Route (No Authentication)

```typescript
@Controller('public')
export class PublicController {
  @Public()
  @Get('health')
  healthCheck() {
    return { status: 'ok' };
  }

  @Public()
  @Get('products')
  getPublicProducts() {
    return this.productsService.getPublic();
  }
}
```

**When to use:**

- Health checks
- Public endpoints (login, register)
- Marketing pages
- Public product listings

### Pattern 2: Authenticated Route (User Required)

```typescript
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  @Get()
  getProfile(@CurrentUser() user: CurrentUserData) {
    return this.profileService.get(user.tenantId, user.userId);
  }

  @Put()
  updateProfile(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateProfileDto) {
    return this.profileService.update(user.tenantId, user.userId, dto);
  }
}
```

**When to use:**

- User profile operations
- User-specific data access
- Any operation requiring user identity

### Pattern 3: Tenant-Scoped Route

```typescript
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.queryBus.execute(new ListProductsQuery(tenantId));
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateProductDto
  ) {
    const command = new CreateProductCommand({
      tenantId,
      actorId: String(user.userId),
      ...dto
    });

    return this.commandBus.execute(command);
  }
}
```

**When to use:**

- Multi-tenant operations
- Organization-scoped data
- Tenant-specific queries

### Pattern 4: Authorization with Custom Guard

```typescript
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Delete(':id')
  @UseGuards(CanDeleteUserGuard)
  async deleteUser(@Param('id') userId: string, @CurrentUser() user: CurrentUserData) {
    return this.commandBus.execute(
      new DeleteUserCommand({
        tenantId: user.tenantId,
        userId: Number(userId),
        actorId: String(user.userId)
      })
    );
  }
}
```

**When to use:**

- Resource ownership validation
- Role-based access control
- Permission checks
- Complex authorization rules

### Pattern 5: Mixed Public and Protected Routes

```typescript
@Controller('auth')
export class AuthController {
  // Public routes
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Protected routes
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: CurrentUserData, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(user.userId, dto.refreshToken);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  getSessions(@CurrentUser() user: CurrentUserData) {
    return this.authService.getSessions(user.userId);
  }
}
```

---

## Custom Guards

### Creating a Custom Guard

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '@package/errors';

@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceId = request.params.id;

    // Step 1: Check if user is admin (admins can access everything)
    if (user.roles?.includes('admin')) {
      return true;
    }

    // Step 2: Fetch resource and check ownership
    const resource = await this.resourceService.findById(resourceId);

    if (!resource) {
      throw Errors.databaserecordNotFound004({ entity: 'Resource' });
    }

    // Step 3: Verify user owns the resource
    if (resource.userId !== user.userId) {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: 'resource:access-own'
      });
    }

    return true;
  }
}
```

### Using Custom Guard

```typescript
@Controller('resources')
@UseGuards(JwtAuthGuard)
export class ResourcesController {
  @Get(':id')
  @UseGuards(ResourceOwnerGuard)
  getResource(@Param('id') resourceId: string) {
    return this.resourcesService.get(resourceId);
  }

  @Put(':id')
  @UseGuards(ResourceOwnerGuard)
  updateResource(@Param('id') resourceId: string, @Body() dto: UpdateResourceDto) {
    return this.resourcesService.update(resourceId, dto);
  }
}
```

### Guard Best Practices

1. **Always extend CanActivate or CanActivate interface**

```typescript
@Injectable()
export class MyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    // Implementation
  }
}
```

2. **Use Reflector for metadata-based guards**

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    // Check roles
  }
}
```

3. **Throw specific errors**

```typescript
// ❌ BAD: Generic error
throw new ForbiddenException('Access denied');

// ✅ GOOD: Specific error from @package/errors
throw Errors.authinsufficientPermissionsRequiredpermission004({
  requiredPermission: 'users:delete'
});
```

4. **Check tenant context**

```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();
  const user = request.user;
  const resource = await this.service.findById(request.params.id);

  // Verify resource belongs to user's tenant
  if (resource.tenantId !== user.tenantId) {
    throw Errors.authinsufficientPermissionsRequiredpermission004({
      requiredPermission: 'cross-tenant-access',
    });
  }

  return true;
}
```

---

## Testing Guards

### Unit Testing JwtAuthGuard

```typescript
import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn()
          }
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn()
          }
        }
      ]
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    jwtService = module.get<JwtService>(JwtService);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should allow public routes', () => {
    const context = createMockExecutionContext({
      headers: {}
    });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw if token is missing', () => {
    const context = createMockExecutionContext({
      headers: {}
    });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    expect(() => guard.canActivate(context)).toThrow('Access token is missing');
  });

  it('should validate token and attach user', () => {
    const context = createMockExecutionContext({
      headers: {
        authorization: 'Bearer valid-token'
      }
    });

    const payload = { userId: 123, tenantId: '456' };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jest.spyOn(jwtService, 'verify').mockReturnValue(payload);

    expect(guard.canActivate(context)).toBe(true);
    expect(context.switchToHttp().getRequest().user).toEqual(payload);
  });

  it('should throw if token is invalid', () => {
    const context = createMockExecutionContext({
      headers: {
        authorization: 'Bearer invalid-token'
      }
    });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jest.spyOn(jwtService, 'verify').mockImplementation(() => {
      throw new Error('Invalid token');
    });

    expect(() => guard.canActivate(context)).toThrow('Invalid or expired access token');
  });
});

function createMockExecutionContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: () => ({}),
    getClass: () => ({})
  } as ExecutionContext;
}
```

### Integration Testing Guards

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module';

describe('Auth Guards (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Login to get access token
    const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'test@example.com',
      password: 'SecurePass123!'
    });

    accessToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow access to public routes without token', async () => {
    const response = await request(app.getHttpServer()).get('/public/health').expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('should deny access to protected routes without token', async () => {
    await request(app.getHttpServer()).get('/profile').expect(401);
  });

  it('should allow access to protected routes with valid token', async () => {
    await request(app.getHttpServer())
      .get('/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('should deny access with invalid token', async () => {
    await request(app.getHttpServer())
      .get('/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('should allow admin to delete any user', async () => {
    // Login as admin
    const adminLogin = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'admin@example.com',
      password: 'AdminPass123!'
    });

    const adminToken = adminLogin.body.accessToken;

    await request(app.getHttpServer())
      .delete('/users/123')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('should allow user to delete own account', async () => {
    await request(app.getHttpServer())
      .delete('/users/456') // User's own ID
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('should deny user from deleting another account', async () => {
    await request(app.getHttpServer())
      .delete('/users/999') // Different user ID
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });
});
```

---

## Best Practices

### 1. Always Use @Public() for Public Routes

```typescript
// ❌ BAD: Unclear if route should be public
@Post('login')
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}

// ✅ GOOD: Explicitly marked as public
@Public()
@Post('login')
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

### 2. Apply Guards at Controller Level When Possible

```typescript
// ✅ GOOD: Guard applied to all routes in controller
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get() findAll() {}
  @Get(':id') findOne() {}
  @Post() create() {}
  @Put(':id') update() {}
  @Delete(':id') delete() {}
}
```

### 3. Use Specific Decorators

```typescript
// ❌ BAD: Extracting manually
@Get('profile')
getProfile(@Req() request: Request) {
  const user = request.user;
  const tenantId = request.headers['x-tenant-id'];
  // ...
}

// ✅ GOOD: Using decorators
@Get('profile')
getProfile(
  @CurrentUser() user: CurrentUserData,
  @TenantId() tenantId: string
) {
  // ...
}
```

### 4. Combine Guards for Authorization

```typescript
// ✅ GOOD: Authentication + Authorization
@Delete(':id')
@UseGuards(JwtAuthGuard, CanDeleteUserGuard)
async deleteUser(@Param('id') userId: string) {
  return this.usersService.delete(userId);
}
```

### 5. Handle Missing User Gracefully

```typescript
@Injectable()
export class MyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // ✅ GOOD: Check if user exists
    if (!user) {
      throw Errors.authinvalidEmailOr001({});
    }

    // Proceed with authorization logic
    return true;
  }
}
```

### 6. Document Guard Behavior

```typescript
/**
 * Resource Owner Guard
 *
 * Validates that the authenticated user owns the resource being accessed.
 *
 * Authorization rules:
 * - Admin users can access any resource in their tenant
 * - Regular users can only access resources they own
 *
 * @throws UnauthorizedException if user is not authenticated
 * @throws ForbiddenException if user doesn't own the resource
 */
@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  // Implementation
}
```

### 7. Test Guards Thoroughly

```typescript
describe('CanDeleteUserGuard', () => {
  it('should allow admin to delete any user', () => {});
  it('should allow user to delete own account', () => {});
  it('should deny user from deleting another account', () => {});
  it('should throw if user is not authenticated', () => {});
  it('should throw if user is not in same tenant', () => {});
});
```

---

## Documentation References

- [Security Architecture](./security.md) - Overall security design
- [Multi-Tenancy](./multi-tenancy.md) - Tenant isolation patterns
- [Testing](./testing.md) - Testing strategies for guards
- [Quick Start](./quick-start.md) - Getting started guide

---

## Guard Reference

| Guard                         | Purpose                     | When to Use                        |
| ----------------------------- | --------------------------- | ---------------------------------- |
| **JwtAuthGuard**              | JWT token validation        | Protect all authenticated routes   |
| **CanDeleteUserGuard**        | User deletion authorization | Delete user endpoints              |
| **RolesGuard**                 | Role-based access control   | Admin-only or role-specific routes |
| **PermissionsGuard**           | Permission-based access     | Fine-grained authorization         |

## Decorator Reference

| Decorator            | Returns         | Purpose                         |
| -------------------- | --------------- | ------------------------------- |
| **@Public()**        | -               | Marks route as public (no auth) |
| **@CurrentUser()**   | CurrentUserData | Extracts authenticated user     |
| **@TenantId()**      | string          | Extracts tenant ID only         |
| **@TenantContext()** | TenantContext   | Extracts full tenant context    |
