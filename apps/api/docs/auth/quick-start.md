# Quick Start Guide

Get started with `@package/auth` in 5 minutes.

## Prerequisites

- Keycloak server running (or use mock provider for testing)
- Redis server running (for token storage, optional)
- NestJS application

## Step 1: Install Package

```bash
pnpm install @package/auth
```

## Step 2: Configure Environment Variables

Add the following to your `.env` file:

```bash
# Keycloak Configuration
KEYCLOAK_AUTH_SERVER_URL=https://keycloak.example.com
KEYCLOAK_REALM=my-realm
KEYCLOAK_CLIENT_ID=my-client
KEYCLOAK_CLIENT_SECRET=my-client-secret

# JWT Configuration
JWT_SECRET=your-jwt-secret
JWT_ISSUER=https://keycloak.example.com/realms/my-realm

# Redis Configuration (for token storage)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
```

## Step 3: Import AuthModule

### For Root Module

```typescript
import { Module } from '@nestjs/common';
import { AuthModule, keycloakAuthConfig } from '@package/auth';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        providers: [
          keycloakAuthConfig({
            default: true
          })
        ],
        jwt: {
          secretOrKey: config.get('JWT_SECRET'),
          issuer: config.get('JWT_ISSUER')
        },
        tokenStorage: {
          enabled: config.get('REDIS_ENABLED', 'true') === 'true',
          enableRotation: true,
          enableBlacklisting: true
        }
      })
    })
  ]
})
export class AppModule {}
```

### For Feature Modules

```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule {}
```

The `AuthModule` is global, so you don't need to import it in feature modules.

## Step 4: Protect Your Routes

### Public Route

```typescript
import { Controller, Post } from '@nestjs/common';
import { Public } from '@package/auth';

@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  login() {
    // Login logic - no authentication required
  }
}
```

### Protected Route

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, User } from '@package/auth';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get('profile')
  getProfile(@User() user: any) {
    return user;
  }
}
```

### Role-Based Access

```typescript
import { Controller, Delete, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles } from '@package/auth';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  @Roles('admin')
  @Delete('users/:id')
  deleteUser() {
    // Only admins can access
  }
}
```

### Permission-Based Access

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RequirePermissions } from '@package/auth';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @RequirePermissions('users:write')
  @Post()
  createUser() {
    // Only users with 'users:write' permission can access
  }
}
```

### Extract Tenant Context

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, TenantId, ActorId } from '@package/auth';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get('posts')
  getPosts(@TenantId() tenantId: string, @ActorId() actorId: string) {
    // Use tenantId for tenant-scoped queries
    // Use actorId for audit logging
    return this.postsService.findByTenant(tenantId);
  }
}
```

## Step 5: Start Keycloak

Using Docker Compose:

```bash
docker compose up -d keycloak
```

Access the admin console at http://localhost:8080/admin

## Step 6: Test Your Setup

### 1. Get a Token

```bash
curl -X POST http://localhost:8080/realms/my-realm/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=my-client" \
  -d "client_secret=my-client-secret" \
  -d "grant_type=password" \
  -d "username=testuser" \
  -d "password=password"
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 300,
  "refresh_expires_in": 1800
}
```

### 2. Access Protected Route

```bash
curl http://localhost:3000/users/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

## Common Patterns

### Controller with Multiple Guards

```typescript
@Controller('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  @Get()
  findAll(@TenantId() tenantId: string) {
    // All endpoints protected by default
  }

  @Public()
  @Post('register')
  register() {
    // Explicitly public
  }

  @Roles('admin')
  @Delete(':id')
  delete() {
    // Admin only
  }
}
```

### Service with Auth Context

```typescript
@Injectable()
export class UsersService {
  async createUser(data: CreateUserDto, tenantId: string, actorId: string) {
    const user = await this.repository.create({
      ...data,
      organizationId: tenantId // Always include
    });

    // Log audit event
    await this.auditService.log({
      eventType: 'user.created',
      tenantId,
      actorId,
      resource: 'user',
      resourceId: user.id
    });

    return user;
  }
}
```

## Troubleshooting

### "Unauthorized" Error

- Verify JWT_SECRET matches Keycloak realm keys
- Check token is not expired
- Verify issuer matches JWT_ISSUER

### "Forbidden" Error

- Check user has required roles
- Verify user has required permissions
- Ensure roles/permissions are in token claims

### Token Not Validating

- Check KEYCLOAK_AUTH_SERVER_URL is accessible
- Verify KEYCLOAK_REALM exists
- Ensure KEYCLOAK_CLIENT_ID is valid

## Next Steps

- [Configuration Guide](./configuration.md) - Advanced configuration options
- [Guards Usage](./guards.md) - Detailed guards documentation
- [Decorators Reference](./decorators.md) - All decorators and examples
- [Multi-Tenancy](./multi-tenancy.md) - Tenant context in tokens
