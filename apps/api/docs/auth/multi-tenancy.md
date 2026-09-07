# Multi-Tenancy

How multi-tenancy is handled in `@package/auth`.

## Overview

The auth package provides built-in multi-tenant support with tenant-scoped tokens, Redis keys, and session management.

## Tenant ID in Tokens

### JWT Token Structure

All JWT tokens include a `tenant_id` claim:

```typescript
interface JwtPayload {
  sub: string; // User ID
  tenant_id: string; // Tenant ID (REQUIRED)
  actor_id: string; // Actor ID (user performing action)
  email: string; // User email
  name: string; // User name
  roles: string[]; // User roles (tenant-specific)
  permissions: string[]; // User permissions (tenant-specific)
  iat: number; // Issued at
  exp: number; // Expiration
}
```

### Token Example

```json
{
  "sub": "usr_123abc",
  "tenant_id": "tenant_456def",
  "actor_id": "usr_123abc",
  "email": "user@example.com",
  "name": "John Doe",
  "roles": ["admin", "user"],
  "permissions": ["users:write", "posts:write"],
  "iat": 1640000000,
  "exp": 1640000300
}
```

## Extracting Tenant ID

### Using @TenantId() Decorator

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

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.postsRepository.findOne(tenantId, id);
  }
}
```

### Using @User() Decorator

```typescript
@Get()
getPosts(@User('tenant_id') tenantId: string) {
  return this.postsService.findByTenant(tenantId);
}
```

### From Request Object

```typescript
@Get()
getPosts(@Request() req) {
  const tenantId = req.user.tenant_id;
  return this.postsService.findByTenant(tenantId);
}
```

## Tenant-Scoped Database Queries

### Repository Pattern

```typescript
@Injectable()
export class PostsRepository {
  async findAll(tenantId: string) {
    return this.db.select().from(postsTable).where(eq(postsTable.organizationId, tenantId));
  }

  async findOne(tenantId: string, postId: string) {
    const [post] = await this.db
      .select()
      .from(postsTable)
      .where(and(eq(postsTable.organizationId, tenantId), eq(postsTable.id, postId)))
      .limit(1);

    return post;
  }

  async create(tenantId: string, data: CreatePostDto) {
    const [post] = await this.db
      .insert(postsTable)
      .values({
        ...data,
        organizationId: tenantId // Always include
      })
      .returning();

    return post;
  }
}
```

### Command Handler Pattern

```typescript
@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  async execute(command: CreatePostCommand) {
    const { tenantId, actorId, ...data } = command;

    const post = await this.postsRepository.create(tenantId, {
      ...data,
      createdBy: actorId
    });

    // Publish tenant-scoped event
    await this.eventBus.publish(new PostCreatedEvent(tenantId, post.id, post.title));

    return post;
  }
}
```

## Tenant-Prefixed Redis Keys

### Key Format

All Redis keys are tenant-prefixed:

```
tenant:{tenantId}:{namespace}:{key}
```

### Key Examples

```
auth:refresh:{tenantId}:{tokenId}           // Refresh token
auth:session:{tenantId}:{sessionId}         // Session
auth:blacklist:access:{tenantId}:{tokenId}  // Blacklisted access token
```

### Token Storage Service

```typescript
@Injectable()
export class TokenStorageService {
  private refreshKey(tenantId: string, tokenId: string): string {
    return `auth:refresh:${tenantId}:${tokenId}`;
  }

  private sessionKey(tenantId: string, sessionId: string): string {
    return `auth:session:${tenantId}:${sessionId}`;
  }

  private blacklistKey(tenantId: string, tokenId: string): string {
    return `auth:blacklist:access:${tenantId}:${tokenId}`;
  }

  async storeRefreshToken(tenantId: string, tokenId: string, data: any) {
    const key = this.refreshKey(tenantId, tokenId);
    await this.redis.set(key, JSON.stringify(data), 'EX', 2592000); // 30 days
  }

  async getRefreshToken(tenantId: string, tokenId: string) {
    const key = this.refreshKey(tenantId, tokenId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteRefreshToken(tenantId: string, tokenId: string) {
    const key = this.refreshKey(tenantId, tokenId);
    await this.redis.del(key);
  }

  async clearTenant(tenantId: string) {
    const pattern = `auth:*:${tenantId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

## Tenant-Prefixed Caching

### Cache Service

```typescript
@Injectable()
export class TenantCacheService {
  private key(tenantId: string, namespace: string, key: string): string {
    return `tenant:${tenantId}:${namespace}:${key}`;
  }

  async get(tenantId: string, namespace: string, key: string) {
    const cacheKey = this.key(tenantId, namespace, key);
    const data = await this.redis.get(cacheKey);
    return data ? JSON.parse(data) : null;
  }

  async set(tenantId: string, namespace: string, key: string, value: any, ttl: number) {
    const cacheKey = this.key(tenantId, namespace, key);
    await this.redis.set(cacheKey, JSON.stringify(value), 'EX', ttl);
  }

  async delete(tenantId: string, namespace: string, key: string) {
    const cacheKey = this.key(tenantId, namespace, key);
    await this.redis.del(cacheKey);
  }

  async clearTenant(tenantId: string) {
    const pattern = `tenant:${tenantId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### Usage in Services

```typescript
@Injectable()
export class UsersService {
  async findByEmail(tenantId: string, email: string) {
    // Check cache first
    const cached = await this.cache.get(tenantId, 'users', `email:${email}`);
    if (cached) return cached;

    // Query database
    const user = await this.usersRepository.findByEmail(tenantId, email);

    // Cache result
    if (user) {
      await this.cache.set(tenantId, 'users', `email:${email}`, user, 300);
    }

    return user;
  }
}
```

## Tenant-Scoped Queues

### Queue Jobs

```typescript
@Injectable()
export class EmailQueue {
  async sendWelcome(tenantId: string, userId: string, email: string) {
    await this.queue.add('send-email', {
      tenantId, // Always include
      userId,
      email,
      type: 'welcome'
    });
  }
}
```

### Queue Processor

```typescript
@Processor('emails')
export class EmailProcessor {
  @Process('send-email')
  async sendEmail(job: Job) {
    const { tenantId, userId, email, type } = job.data;

    // Process email for specific tenant
    await this.emailService.send({
      tenantId,
      userId,
      email,
      template: type
    });
  }
}
```

## Tenant Validation

### Verify User Belongs to Tenant

```typescript
@Injectable()
export class TenantGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const headerTenantId = request.headers['x-organization-id'];

    // Verify user's tenant matches header
    if (user.tenant_id !== headerTenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }

    return true;
  }
}
```

### Usage

```typescript
@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UsersController {
  @Get('posts')
  getPosts(@TenantId() tenantId: string) {
    // Tenant already validated
    return this.postsService.findByTenant(tenantId);
  }
}
```

## Tenant Isolation Guarantees

### Database Level

- All tables have `organization_id` column
- All queries include `WHERE organization_id = ?`
- Unique constraints include `organization_id`

### Cache Level

- All cache keys are tenant-prefixed
- No cache sharing across tenants
- Tenant-wide cache invalidation

### Queue Level

- All jobs include `tenantId`
- Queue names can be tenant-prefixed
- Job processors validate tenant context

### Application Level

- Guards validate tenant context
- Commands include `tenantId`
- Events include `tenantId`

## Best Practices

1. **Always extract tenantId** - Use @TenantId() decorator
2. **Pass tenantId to repositories** - Never query without tenant filter
3. **Prefix Redis keys** - Use `tenant:{tenantId}:` prefix
4. **Include tenantId in jobs** - All background jobs need tenant context
5. **Validate tenant context** - Ensure user belongs to tenant
6. **Publish tenant-scoped events** - Events include tenantId
7. **Never share cache across tenants** - Prevent data leakage
8. **Log tenant context** - Include tenantId in all logs

## Security Considerations

### Prevent Cross-Tenant Access

```typescript
// ❌ WRONG - No tenant validation
async getUser(userId: string) {
  return this.usersRepository.findById(userId); // Could return any tenant's user
}

// ✅ CORRECT - Always include tenantId
async getUser(tenantId: string, userId: string) {
  return this.usersRepository.findOne(tenantId, userId);
}
```

### Validate Tenant Headers

```typescript
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const tenantId = req.headers['x-organization-id'];

    if (!tenantId) {
      throw new BadRequestException('Missing tenant header');
    }

    // Validate tenant exists
    const tenant = await this.tenantService.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    req.tenant = { id: tenantId };
    next();
  }
}
```

## Testing

### Test Tenant Isolation

```typescript
describe('Tenant Isolation', () => {
  it('should not access other tenant data', async () => {
    const tenant1Id = 'tenant-1';
    const tenant2Id = 'tenant-2';

    // Create user in tenant-1
    await createTestUser(tenant1Id, 'user1@example.com');

    // Try to access from tenant-2
    const result = await usersService.findByEmail(tenant2Id, 'user1@example.com');

    expect(result).toBeNull(); // Should not find user from tenant-1
  });
});
```

### Mock Tenant Context

```typescript
const mockTenantId = 'test-tenant';
const mockUser = {
  sub: 'user-123',
  tenant_id: mockTenantId,
  email: 'test@example.com'
};

// Mock @TenantId() decorator
jest.mock('@package/auth', () => ({
  ...jest.requireActual('@package/auth'),
  TenantId: () => jest.fn().mockReturnValue(mockTenantId)
}));
```

## Next Steps

- [Configuration Guide](./configuration.md) - Configure multi-tenant auth
- [Guards Usage](./guards.md) - Protect tenant-specific routes
- [Testing](./testing.md) - Test multi-tenant scenarios
