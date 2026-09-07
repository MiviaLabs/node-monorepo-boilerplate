# Configuration Guide

Complete configuration reference for `@package/auth`.

## Environment Variables

### Keycloak Configuration

| Variable                   | Type   | Required | Default                   | Description                                                |
| -------------------------- | ------ | -------- | ------------------------- | ---------------------------------------------------------- |
| `KEYCLOAK_AUTH_SERVER_URL` | string | Yes      | -                         | Keycloak server URL                                        |
| `KEYCLOAK_REALM`           | string | Yes      | -                         | Keycloak realm name                                        |
| `KEYCLOAK_CLIENT_ID`       | string | Yes      | -                         | Keycloak client ID                                         |
| `KEYCLOAK_CLIENT_SECRET`   | string | Yes\*    | -                         | Keycloak client secret (required for confidential clients) |
| `KEYCLOAK_ADMIN_URL`       | string | No       | `{AUTH_SERVER_URL}/admin` | Keycloak admin URL (for admin operations)                  |
| `KEYCLOAK_ADMIN_USERNAME`  | string | No       | -                         | Keycloak admin username                                    |
| `KEYCLOAK_ADMIN_PASSWORD`  | string | No       | -                         | Keycloak admin password                                    |

### JWT Configuration

| Variable                | Type    | Required | Default | Description                            |
| ----------------------- | ------- | -------- | ------- | -------------------------------------- |
| `JWT_SECRET`            | string  | Yes      | -       | JWT secret or public key               |
| `JWT_ISSUER`            | string  | No       | -       | JWT issuer (for validation)            |
| `JWT_AUDIENCE`          | string  | No       | -       | JWT audience (for validation)          |
| `JWT_IGNORE_EXPIRATION` | boolean | No       | false   | Ignore token expiration (testing only) |

### Token Storage Configuration

| Variable                     | Type    | Required | Default   | Description                                 |
| ---------------------------- | ------- | -------- | --------- | ------------------------------------------- |
| `REDIS_ENABLED`              | boolean | No       | true      | Enable Redis token storage                  |
| `REDIS_HOST`                 | string  | No\*     | localhost | Redis host (required if enabled)            |
| `REDIS_PORT`                 | number  | No       | 6379      | Redis port                                  |
| `REDIS_PASSWORD`             | string  | No       | -         | Redis password                              |
| `TOKEN_ROTATION_ENABLED`     | boolean | No       | true      | Enable token rotation                       |
| `TOKEN_BLACKLISTING_ENABLED` | boolean | No       | true      | Enable access token blacklisting            |
| `REFRESH_TOKEN_EXPIRATION`   | number  | No       | 2592000   | Refresh token expiration (seconds, 30 days) |
| `SESSION_EXPIRATION`         | number  | No       | 604800    | Session expiration (seconds, 7 days)        |

### Module Configuration

| Variable                  | Type    | Required | Default | Description                      |
| ------------------------- | ------- | -------- | ------- | -------------------------------- |
| `AUTH_GLOBAL_GUARD`       | boolean | No       | false   | Enable global JWT auth guard     |
| `AUTH_ENABLE_ROLES`       | boolean | No       | true    | Enable role-based access control |
| `AUTH_ENABLE_PERMISSIONS` | boolean | No       | true    | Enable permission-based access   |

## Module Setup

### forRoot() - Static Configuration

```typescript
import { Module } from '@nestjs/common';
import { AuthModule, keycloakAuthConfig } from '@package/auth';

@Module({
  imports: [
    AuthModule.forRoot({
      providers: [
        keycloakAuthConfig({
          default: true,
          name: 'keycloak'
        })
      ],
      jwt: {
        secretOrKey: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        ignoreExpiration: false
      },
      tokenStorage: {
        enabled: true,
        enableRotation: true,
        enableBlacklisting: true,
        refreshTokenExpiration: 2592000, // 30 days
        sessionExpiration: 604800 // 7 days
      },
      globalAuthGuard: false,
      enableRoles: true,
      enablePermissions: true
    })
  ]
})
export class AppModule {}
```

### forRootAsync() - Dynamic Configuration

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule, keycloakAuthConfig } from '@package/auth';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        providers: [
          keycloakAuthConfig({
            default: true,
            authServerUrl: config.get('KEYCLOAK_AUTH_SERVER_URL'),
            realm: config.get('KEYCLOAK_REALM'),
            clientId: config.get('KEYCLOAK_CLIENT_ID'),
            clientSecret: config.get('KEYCLOAK_CLIENT_SECRET')
          })
        ],
        jwt: {
          secretOrKey: config.get('JWT_SECRET'),
          issuer: config.get('JWT_ISSUER'),
          audience: config.get('JWT_AUDIENCE'),
          ignoreExpiration: config.get('JWT_IGNORE_EXPIRATION', 'false') === 'true'
        },
        tokenStorage: {
          enabled: config.get('REDIS_ENABLED', 'true') === 'true',
          enableRotation: config.get('TOKEN_ROTATION_ENABLED', 'true') === 'true',
          enableBlacklisting: config.get('TOKEN_BLACKLISTING_ENABLED', 'true') === 'true',
          refreshTokenExpiration: config.get('REFRESH_TOKEN_EXPIRATION', 2592000),
          sessionExpiration: config.get('SESSION_EXPIRATION', 604800)
        },
        globalAuthGuard: config.get('AUTH_GLOBAL_GUARD', 'false') === 'true',
        enableRoles: config.get('AUTH_ENABLE_ROLES', 'true') === 'true',
        enablePermissions: config.get('AUTH_ENABLE_PERMISSIONS', 'true') === 'true'
      })
    })
  ]
})
export class AppModule {}
```

## Configuration Options

### Auth Provider Configuration

```typescript
interface AuthProviderConfig {
  name: string; // Provider name
  default?: boolean; // Is this the default provider?
  authServerUrl?: string; // Auth server URL
  realm?: string; // Keycloak realm
  clientId?: string; // Client ID
  clientSecret?: string; // Client secret
}
```

### JWT Configuration

```typescript
interface JwtConfig {
  secretOrKey: string; // JWT secret or public key
  issuer?: string; // Expected issuer (for validation)
  audience?: string; // Expected audience (for validation)
  ignoreExpiration?: boolean; // Ignore token expiration (testing only)
}
```

### Token Storage Configuration

```typescript
interface TokenStorageConfig {
  enabled?: boolean; // Enable Redis token storage
  enableRotation?: boolean; // Enable token rotation
  enableBlacklisting?: boolean; // Enable access token blacklisting
  refreshTokenExpiration?: number; // Refresh token TTL (seconds)
  sessionExpiration?: number; // Session TTL (seconds)
}
```

### Module Configuration

```typescript
interface AuthModuleConfig {
  providers: AuthProviderConfig[]; // Auth providers
  jwt: JwtConfig; // JWT configuration
  tokenStorage?: TokenStorageConfig; // Token storage config
  globalAuthGuard?: boolean; // Enable global guard
  enableRoles?: boolean; // Enable RBAC
  enablePermissions?: boolean; // Enable permission-based access
}
```

## Advanced Configuration

### Multiple Auth Providers

```typescript
AuthModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    providers: [
      keycloakAuthConfig({
        name: 'keycloak-primary',
        default: true,
        authServerUrl: config.get('KEYCLOAK_PRIMARY_URL'),
        realm: config.get('KEYCLOAK_PRIMARY_REALM'),
      }),
      keycloakAuthConfig({
        name: 'keycloak-secondary',
        default: false,
        authServerUrl: config.get('KEYCLOAK_SECONDARY_URL'),
        realm: config.get('KEYCLOAK_SECONDARY_REALM'),
      }),
    ],
    jwt: {
      secretOrKey: config.get('JWT_SECRET'),
    },
  }),
}),
```

### Custom Provider Configuration

```typescript
import { IAuthProvider } from '@package/auth';

// Custom provider implementation
class CustomAuthProvider extends BaseAuthProvider {
  async authenticate(credentials: UserCredentials): Promise<AuthResult> {
    // Custom authentication logic
  }
}

// Register custom provider
AuthModule.forRoot({
  providers: [
    {
      name: 'custom',
      default: true,
      provider: CustomAuthProvider,
    },
  ],
  jwt: {
    secretOrKey: process.env.JWT_SECRET,
  },
}),
```

### Global Guard with Public Routes

```typescript
// Enable global guard
(AuthModule.forRoot({
  // ... other config
  globalAuthGuard: true
}),
  // Then use @Public() decorator for public routes
  @Controller('auth')
  export class AuthController {
    @Public()
    @Post('login')
    login() {
      // Public route
    }
  });
```

## Testing Configuration

### Using Mock Provider

```typescript
import { createMockAuthProvider } from '@package/auth';

// In test setup
const mockAuth = createMockAuthProvider({
  name: 'test-auth',
  latency: 10, // Simulate latency in ms
  failureRate: 0.01, // 1% failure rate
});

AuthModule.forRoot({
  providers: [
    {
      name: 'test-auth',
      default: true,
      provider: mockAuth,
    },
  ],
  jwt: {
    secretOrKey: 'test-secret',
    ignoreExpiration: true, // For testing
  },
  tokenStorage: {
    enabled: false, // Disable Redis in tests
  },
}),
```

### Test Environment Variables

```bash
# .env.test
KEYCLOAK_AUTH_SERVER_URL=http://localhost:8080
KEYCLOAK_REALM=test-realm
KEYCLOAK_CLIENT_ID=test-client
KEYCLOAK_CLIENT_SECRET=test-secret
JWT_SECRET=test-secret
JWT_ISSUER=http://localhost:8080/realms/test-realm
REDIS_ENABLED=false
JWT_IGNORE_EXPIRATION=true
```

## Validation

### Verify Configuration

```typescript
import { AuthService } from '@package/auth';

@Injectable()
export class AppService {
  constructor(private readonly auth: AuthService) {}

  async verifyConfig() {
    // Test authentication
    try {
      const result = await this.auth.authenticate({
        username: 'test',
        password: 'test',
        tenantId: 'test-tenant'
      });
      console.log('Auth configured successfully');
    } catch (error) {
      console.error('Auth configuration error:', error);
    }
  }
}
```

### Health Check

```typescript
@Controller('health')
export class HealthController {
  constructor(private readonly auth: AuthService) {}

  @Get('auth')
  @Public()
  async authHealth() {
    try {
      await this.auth.getProviderStatus();
      return { status: 'ok', auth: 'connected' };
    } catch (error) {
      return { status: 'error', auth: 'disconnected', message: error.message };
    }
  }
}
```

## Best Practices

1. **Use forRootAsync** for environment-based configuration
2. **Store secrets in environment variables** (or use 1Password)
3. **Enable token rotation** for better security
4. **Enable blacklisting** for secure logout
5. **Use short-lived access tokens** (5-15 minutes)
6. **Use long-lived refresh tokens** (30 days)
7. **Set appropriate TTLs** for refresh tokens and sessions
8. **Test with mock provider** to avoid external dependencies
9. **Monitor auth metrics** with OpenTelemetry
10. **Log auth events** for audit trails

## Troubleshooting

### Configuration Errors

**Error: "JWT secret not configured"**

- Set `JWT_SECRET` environment variable
- Check AuthModule jwt configuration

**Error: "Keycloak connection failed"**

- Verify Keycloak is running
- Check `KEYCLOAK_AUTH_SERVER_URL`
- Ensure realm exists

**Error: "Redis connection failed"**

- Verify Redis is running
- Check `REDIS_HOST` and `REDIS_PORT`
- Set `REDIS_ENABLED=false` to disable

### Token Validation Errors

**Error: "Invalid token"**

- Verify JWT_SECRET matches Keycloak keys
- Check token is not expired
- Verify issuer matches JWT_ISSUER

**Error: "Missing tenant_id claim"**

- Ensure Keycloak includes tenant_id in token
- Check token mapper configuration
- Verify token format

## Next Steps

- [Guards Usage](./guards.md) - How to use auth guards
- [Decorators Reference](./decorators.md) - Available decorators
- [Multi-Tenancy](./multi-tenancy.md) - Tenant context handling
