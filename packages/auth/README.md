# @package/auth

**Enterprise-grade authentication infrastructure with multi-provider support, JWT token management, role-based access control, and NestJS integration.**

## What is it?

`@package/auth` provides enterprise authentication and authorization infrastructure for backend services with support for:

- Multiple auth providers (Custom JWT, Google OAuth, Google Identity Platform, and Keycloak)
- JWT token validation and verification
- Token refresh with rotation using Redis
- Role and permission-based access control
- OpenTelemetry integration for observability
- NestJS module with guards and decorators
- Multi-tenant support

## Features

- **Multi-Provider Auth** - Keycloak, Google Cloud Identity Platform, Google OAuth, and Custom JWT
- **JWT Token Management** - Validation, verification, refresh with rotation
- **Redis Token Storage** - Refresh token storage, blacklisting, session management
- **NestJS Guards** - JwtAuthGuard, RolesGuard, PermissionsGuard
- **NestJS Decorators** - @Public, @Roles, @RequirePermissions, @User, @ActorId
- **Passport-JWT Strategy** - Standard Passport integration
- **Multi-Tenant Support** - Tenant-scoped tokens and sessions
- **OpenTelemetry Integration** - Built-in tracing and metrics
- **Type-Safe** - Full TypeScript support
- **Mock Provider** - Testing without external dependencies

## Installation

```bash
pnpm install @package/auth
```

## Quick Start

### Basic Usage (NestJS)

```typescript
import { Module } from '@nestjs/common';
import { AuthModule, keycloakAuthConfig } from '@package/auth';

@Module({
  imports: [
    AuthModule.forRoot({
      providers: [
        keycloakAuthConfig({
          default: true
        })
      ],
      jwt: {
        secretOrKey: process.env.JWT_SECRET
      }
    })
  ]
})
export class AppModule {}
```

### Using the Auth Service

```typescript
import { Injectable } from '@nestjs/common';
import { AuthService } from '@package/auth';

@Injectable()
export class UsersService {
  constructor(private readonly auth: AuthService) {}

  async loginUser(username: string, password: string, tenantId: string) {
    return this.auth.authenticate({ username, password, tenantId });
  }

  async validateUser(token: string) {
    return this.auth.validateToken(token);
  }
}
```

### Using Guards

```typescript
import { Controller, Get, Post } from '@nestjs/common';
import { JwtAuthGuard, Roles, RequirePermissions, User, UserId } from '@package/auth';

@Controller('users')
export class UsersController {
  // Public route (no auth required)
  @Public()
  @Post('login')
  login() {
    // Login logic
  }

  // Protected route (requires auth)
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@User() user: any) {
    return user;
  }

  // Requires admin role
  @Roles('admin')
  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    // Delete logic
  }

  // Requires specific permission
  @RequirePermissions('users:write')
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    // Create logic
  }
}
```

## Configuration

### Environment Variables

```bash
# Keycloak Configuration
KEYCLOAK_AUTH_SERVER_URL=https://keycloak.example.com
KEYCLOAK_REALM=my-realm
KEYCLOAK_CLIENT_ID=my-client
KEYCLOAK_CLIENT_SECRET=my-client-secret

# Keycloak Admin Credentials (Optional)
# Required for Admin REST API operations (getUserInfo, getRoles, etc.)
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin-password

# Google Cloud Platform Configuration (OAuth 2.0)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback/google
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_HD=your-domain.com
GOOGLE_TENANT_ID=your-tenant-id
GOOGLE_TIMEOUT=5000

# Google Cloud Identity Platform Configuration
# (Accepts both GOOGLE_CLOUD_PROJECT_ID and FIREBASE_PROJECT_ID)
GOOGLE_CLOUD_PROJECT_ID=your-project-id
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_ID=your-firebase-client-id
FIREBASE_CLIENT_SECRET=your-firebase-client-secret
FIREBASE_API_KEY=your-firebase-api-key
FIREBASE_TENANT_ID=your-firebase-tenant-id

# JWT Configuration
JWT_SECRET=your-jwt-secret
JWT_ISSUER=https://keycloak.example.com/realms/my-realm

# Redis Configuration (for token storage)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
```

### Module Configuration

#### Single Provider (Keycloak)

```typescript
AuthModule.forRoot({
  providers: [
    keycloakAuthConfig({
      default: true
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
  globalAuthGuard: false, // Set to true to protect all routes by default
  enableRoles: true,
  enablePermissions: true
});
```

#### Single Provider (Google)

```typescript
AuthModule.forRoot({
  providers: [
    googleAuthConfig({
      default: true
    })
  ],
  jwt: {
    secretOrKey: process.env.JWT_SECRET,
    issuer: 'https://accounts.google.com',
    audience: process.env.GOOGLE_CLIENT_ID,
    algorithm: 'RS256'
  },
  tokenStorage: {
    enabled: true,
    enableRotation: true,
    enableBlacklisting: true
  }
});
```

#### Single Provider (Google Cloud Identity Platform)

```typescript
AuthModule.forRoot({
  providers: [
    googleIdentityPlatformAuthConfig({
      default: true
    })
  ],
  jwt: {
    secretOrKey: process.env.JWT_SECRET,
    issuer: 'https://securetoken.google.com/YOUR_PROJECT_ID',
    audience: process.env.FIREBASE_CLIENT_ID,
    algorithm: 'RS256'
  },
  tokenStorage: {
    enabled: true,
    enableRotation: true,
    enableBlacklisting: true
  }
});
```

#### Multi-Provider Configuration (Keycloak + Google)

```typescript
AuthModule.forRoot({
  providers: [
    // Primary provider (password grant support)
    keycloakAuthConfig({
      default: true
    }),
    // Secondary provider (OAuth 2.0 flow only)
    googleAuthConfig({
      default: false
    })
  ],
  jwt: {
    // Configure JWT to work with both providers
    secretOrKey: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER, // Keycloak issuer
    audience: process.env.JWT_AUDIENCE,
    algorithm: 'RS256'
  }
});

// Usage: Select provider by name
const keycloakAuth = await auth.getProvider('keycloak');
const googleAuth = await auth.getProvider('google');
```

### Async Configuration

```typescript
import { ConfigService } from '@nestjs/config';

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
      enabled: config.get('REDIS_ENABLED'),
      enableRotation: config.get('TOKEN_ROTATION_ENABLED')
    }
  })
});
```

## API Reference

### AuthService

```typescript
class AuthService {
  // Authenticate user with credentials
  authenticate(credentials: UserCredentials, providerName?: string): Promise<AuthResult>;

  // Validate access token
  validateToken(token: string, providerName?: string): Promise<TokenValidationResult>;

  // Refresh access token
  refreshToken(refreshToken: string, providerName?: string): Promise<TokenRefreshResult>;

  // Logout user
  logout(refreshToken: string, accessToken?: string, providerName?: string): Promise<void>;

  // Get user information
  getUserInfo(userId: string, tenantId: string, providerName?: string): Promise<UserInfo>;

  // Get user roles
  getRoles(userId: string, tenantId: string, providerName?: string): Promise<string[]>;

  // Get user permissions
  getPermissions(userId: string, tenantId: string, providerName?: string): Promise<string[]>;
}
```

### JwtService

```typescript
class JwtService {
  // Decode JWT token
  decode(token: string): JwtPayload;

  // Validate JWT token (basic validation)
  validate(token: string, options?: JwtValidateOptions): TokenValidationResult;

  // Extract claims from token
  extractTenantId(token: string): string | undefined;
  extractUserId(token: string): string | undefined;
  extractActorId(token: string): string | undefined;
  extractRoles(token: string): string[];
  extractPermissions(token: string): string[];

  // Token utilities
  isExpired(token: string): boolean;
  getExpiration(token: string): Date | undefined;
  getTokenId(token: string): string | undefined;
}
```

### TokenService

```typescript
class TokenService {
  // Refresh token management
  storeRefreshToken(tokenId, userId, tenantId, sessionId, expiresIn): Promise<void>;
  getRefreshToken(tokenId, tenantId): Promise<RefreshTokenInfo | undefined>;
  revokeRefreshToken(tokenId, tenantId): Promise<void>;
  deleteRefreshToken(tokenId, tenantId): Promise<void>;

  // Session management
  storeSession(sessionId, userId, tenantId, tokenId, expiresIn): Promise<void>;
  getSession(sessionId, tenantId): Promise<SessionInfo>;
  updateSessionActivity(sessionId, tenantId): Promise<void>;
  invalidateSession(sessionId, tenantId): Promise<void>;

  // Access token blacklisting
  blacklistAccessToken(tokenId, tenantId, expiresIn): Promise<void>;
  isAccessTokenBlacklisted(tokenId, tenantId): Promise<boolean>;
}
```

## Decorators Reference

### @Public()

Mark a route as public (no authentication required).

```typescript
@Public()
@Get('health')
healthCheck() {
  return { status: 'ok' };
}
```

### @Roles(...roles)

Require specific roles to access the route.

```typescript
@Roles('admin', 'moderator')
@Delete('users/:id')
deleteUser(@Param('id') id: string) {
  // ...
}
```

### @RequirePermissions(...permissions)

Require specific permissions to access the route.

```typescript
@RequirePermissions('users:write', 'users:delete')
@Delete('users/:id')
deleteUser(@Param('id') id: string) {
  // ...
}
```

### @User()

Extract the authenticated user from the request.

```typescript
@Get('profile')
getProfile(@User() user: any) {
  return user;
}
```

### @UserId()

Extract the user ID from the request.

```typescript
@Get('posts')
getMyPosts(@UserId() userId: string) {
  return this.postsService.findByUser(userId);
}
```

### @TenantId()

Extract the tenant ID from the request.

```typescript
@Get('posts')
getPosts(@TenantId() tenantId: string) {
  return this.postsService.findByTenant(tenantId);
}
```

### @ActorId()

Extract the actor ID from the request (useful for audit trails).

```typescript
@Post('posts')
createPost(@Body() dto: CreatePostDto, @ActorId() actorId: string) {
  return this.postsService.create(dto, actorId);
}
```

## Guards Reference

### JwtAuthGuard

Protects routes using JWT authentication. Respects @Public() decorator.

```typescript
@UseGuards(JwtAuthGuard)
@Get('protected')
protectedRoute() {
  // ...
}
```

### RolesGuard

Checks if the user has required roles.

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Get('admin')
adminRoute() {
  // ...
}
```

### PermissionsGuard

Checks if the user has required permissions.

```typescript
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('admin:write')
@Post('admin')
adminAction() {
  // ...
}
```

## Multi-Tenancy

Tokens include a `tenant_id` claim, and all Redis keys are tenant-prefixed:

```typescript
// JWT payload includes tenant_id
interface JwtPayload {
  sub: string;           // User ID
  tenant_id: string;     // Tenant ID
  actor_id: string;      // Actor ID (user performing action)
  roles: string[];       // User roles
  permissions: string[]; // User permissions
  // ... other claims
}

// Redis keys are tenant-scoped
auth:refresh:{tenantId}:{tokenId}  // Refresh token
auth:session:{tenantId}:{sessionId} // Session
auth:blacklist:access:{tenantId}:{tokenId} // Blacklisted access token
```

## Google Cloud Identity Platform Provider

The Google Cloud Identity Platform provider is an enterprise-grade authentication solution that provides:

- **Password-based authentication** with email verification
- **OAuth providers** (Google, GitHub, Facebook, etc.)
- **SAML and OIDC** for enterprise SSO
- **Multi-tenancy** with isolated user pools per tenant
- **Custom claims** for roles and permissions
- **Token management** with automatic refresh
- **User management** APIs

### Quick Start with Google Cloud Identity Platform

```typescript
import { GoogleIdentityPlatformAuthProvider } from '@package/auth';

const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'my-project-id',
  apiKey: 'my-api-key',
  serviceAccount: {
    projectId: 'my-project-id',
    clientEmail: 'firebase-adminsdk@my-project-id.iam.gserviceaccount.com',
    privateKey: process.env.FIREBASE_PRIVATE_KEY
  }
});

// Authenticate user with email and password
const result = await provider.authenticate({
  username: 'user@example.com',
  password: 'secure-password'
});

console.log(result.accessToken); // JWT access token
console.log(result.refreshToken); // Refresh token for token renewal
```

### Documentation

For comprehensive documentation on Google Cloud Identity Platform provider, including:

- Complete setup guide
- Configuration examples
- Multi-tenancy support
- Migration guides
- Troubleshooting
- FAQ

See: [docs/google-identity-platform.md](./docs/google-identity-platform.md)

### Comparison: Google Identity Platform vs Google OAuth

| Feature             | Google Identity Platform | Google OAuth Provider |
| ------------------- | ------------------------ | --------------------- |
| Password Grant      | Yes                      | No (OAuth flow only)  |
| Multi-Tenancy       | Yes (tenants)            | No                    |
| Custom Claims       | Yes                      | No                    |
| User Management     | Full CRUD                | Read-only             |
| Roles & Permissions | Yes (custom claims)      | Not supported         |
| Enterprise SSO      | SAML, OIDC               | OAuth only            |
| Use Case            | Enterprise auth          | Social login          |

For detailed information, see the [Google Cloud Identity Platform documentation](./docs/google-identity-platform.md).

## Google Cloud Platform Provider

The Google auth provider supports OAuth 2.0 and OpenID Connect for Google Cloud Platform and Google Workspace.

### Important Notes

- **No Password Grant**: Google does NOT support password grant (Resource Owner Password Credentials). You must use OAuth 2.0 authorization code flow.
- **No Built-in Roles/Permissions**: Google does not have built-in role or permission management. `getRoles()` and `getPermissions()` return empty arrays.
- **Token Verification**: Uses `google-auth-library` for secure token verification.
- **Google Workspace**: Supports domain restriction via `hd` parameter for enterprise identity.

### Getting Started with Google

#### Step 1: Create Google OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth 2.0 Client ID**
5. Configure the OAuth consent screen
6. Add authorized redirect URIs (e.g., `http://localhost:3000/auth/callback/google`)
7. Copy your **Client ID** and **Client Secret**

#### Step 2: Configure Environment Variables

```bash
# Required
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback/google

# Optional
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_HD=your-domain.com  # Google Workspace domain restriction
GOOGLE_TENANT_ID=your-tenant-id  # For workforce identity federation
GOOGLE_TIMEOUT=5000  # Request timeout in milliseconds
```

### Configuration

#### Using googleAuthConfig() Helper (Legacy)

```typescript
import { AuthModule, googleAuthConfig } from '@package/auth';

@Module({
  imports: [
    AuthModule.forRoot({
      providers: [
        googleAuthConfig({
          default: false // Set to true if Google is your primary provider
        })
      ]
    })
  ]
})
export class AppModule {}
```

#### Using New Configuration Layer (Recommended)

```typescript
import { AuthModule } from '@package/auth';
import { resolveConfig } from '@package/auth/config';

// Get resolved configuration
const config = resolveConfig({
  google: {
    clientId: 'your-client-id.apps.googleusercontent.com',
    clientSecret: 'your-client-secret',
    redirectUri: 'http://localhost:3000/auth/callback/google',
    projectId: 'your-project-id',
    hd: 'your-domain.com', // Optional: restrict to Google Workspace domain
    tenantId: 'your-tenant-id', // Optional: for workforce identity
    timeout: 5000
  }
});

// Use configuration
console.log(config.google.clientId);
```

### Google OAuth 2.0 Authorization Code Flow

Since Google doesn't support password grant, you must implement the OAuth 2.0 authorization code flow:

#### Complete Implementation Example

```typescript
import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  UnauthorizedException
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '@package/auth';
import { OAuth2Client } from 'google-auth-library';

@Controller('auth')
export class AuthController {
  private oauth2Client: OAuth2Client;

  constructor(private readonly auth: AuthService) {
    // Initialize Google OAuth2 client
    this.oauth2Client = new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI
    });
  }

  /**
   * Step 1: Redirect user to Google consent screen
   * GET /auth/google
   */
  @Get('google')
  loginWithGoogle(@Res() res: Response) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const scope = 'openid profile email';

    // Generate state parameter for CSRF protection
    const state = Buffer.from(JSON.stringify({ nonce: Date.now() })).toString('base64');

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}`;

    res.redirect(authUrl);
  }

  /**
   * Step 2: Handle callback from Google
   * GET /auth/google/callback?code=...&state=...
   */
  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    try {
      if (!code) {
        throw new BadRequestException('Authorization code is required');
      }

      // Validate state parameter (CSRF protection)
      // In production, verify state matches what you stored in session/cookie

      // Step 3: Exchange authorization code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new UnauthorizedException('Failed to obtain access token');
      }

      // Step 4: Validate the ID token and get user info
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid ID token payload');
      }

      // Step 5: Create your own JWT with tenant_id claim
      const userId = payload.sub;
      const tenantId = payload.hd || 'default'; // Use Google Workspace domain as tenant

      // Store refresh token in Redis for later use
      if (tokens.refresh_token) {
        // Use TokenService to store refresh token
        // await this.tokenService.storeRefreshToken(...);
      }

      // Step 6: Return user info and tokens to client
      res.json({
        userId,
        email: payload.email,
        name: payload.name,
        tenantId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600
      });
    } catch (error) {
      console.error('Google callback error:', error);
      throw new UnauthorizedException('Failed to authenticate with Google');
    }
  }

  /**
   * Step 7: Refresh access token
   * POST /auth/google/refresh
   */
  @Post('google/refresh')
  async refreshGoogleToken(@Body('refreshToken') refreshToken: string) {
    try {
      // Set the refresh token on the OAuth2 client
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      // Refresh the access token
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token, // May be undefined if not rotated
        expiresIn: credentials.expiry_date
          ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
          : 3600
      };
    } catch (error) {
      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  /**
   * Step 8: Logout and revoke tokens
   * POST /auth/google/logout
   */
  @Post('google/logout')
  async logoutFromGoogle(
    @Body('refreshToken') refreshToken: string,
    @Body('accessToken') accessToken?: string
  ) {
    try {
      // Revoke the refresh token using Google's revoke endpoint
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
        {
          method: 'POST'
        }
      );

      // Optionally blacklist the access token for immediate revocation
      if (accessToken) {
        // Use TokenService to blacklist access token
        // await this.tokenService.blacklistAccessToken(...);
      }

      return { message: 'Logged out successfully' };
    } catch (error) {
      throw new UnauthorizedException('Failed to logout');
    }
  }
}
```

### Google Workspace Domain Restriction

To restrict authentication to users from a specific Google Workspace domain:

```typescript
// In your Google Cloud Console, configure the OAuth consent screen
// Then use the 'hd' parameter in your auth URL

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${clientId}&` +
  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(scope)}&` +
  `hd=${encodeURIComponent('your-domain.com')}`; // Domain restriction

// After authentication, verify the domain
const payload = ticket.getPayload();
if (payload.hd !== 'your-domain.com') {
  throw new UnauthorizedException('User is not a member of the required domain');
}

// Use the domain as tenant ID for multi-tenancy
const tenantId = payload.hd || 'default';
```

### Google vs Keycloak Comparison

| Feature                    | Keycloak                                        | Google                                      |
| -------------------------- | ----------------------------------------------- | ------------------------------------------- |
| **Authentication Methods** | Password grant, OAuth 2.0, OpenID Connect, SAML | OAuth 2.0, OpenID Connect only              |
| **Roles & Permissions**    | Built-in role and permission management         | Not supported (return empty arrays)         |
| **Token Structure**        | Customizable JWT claims                         | Standard Google JWT claims                  |
| **Multi-Tenancy**          | Realms as tenant boundaries                     | Use `hd` (domain) or custom tenant_id       |
| **User Management**        | Full user administration                        | Google Workspace Directory API              |
| **Configuration**          | Self-hosted, full control                       | Google Cloud Console                        |
| **Use Case**               | Enterprise, complex auth flows                  | Consumer apps, Google Workspace integration |

### Google-Specific Error Handling

```typescript
import {
  AuthenticationError,
  TokenValidationError,
  InvalidAuthProviderConfigError
} from '@package/auth';

try {
  const result = await googleAuthProvider.validateToken(token);
} catch (error) {
  if (error instanceof TokenValidationError) {
    // Handle token validation errors
    if (error.message.includes('invalid_grant')) {
      // Token has been revoked or is invalid
      console.error('Token invalid:', error.message);
    } else if (error.message.includes('expired_token')) {
      // Token has expired
      console.error('Token expired:', error.message);
    }
  } else if (error instanceof InvalidAuthProviderConfigError) {
    // Handle configuration errors
    if (error.message.includes('redirect_uri_mismatch')) {
      console.error('Redirect URI mismatch in Google Cloud Console');
    }
  }
}
```

### Troubleshooting Google Authentication

#### "invalid_grant" Error

**Cause**: Token has been revoked, expired, or redirect URI mismatch.

**Solution**:

1. Verify redirect URI in Google Cloud Console matches your application
2. Check token expiration and implement refresh logic
3. Ensure client ID and secret are correct

#### "redirect_uri_mismatch" Error

**Cause**: Redirect URI in request doesn't match authorized URIs in Google Cloud Console.

**Solution**:

1. Go to Google Cloud Console > APIs & Services > Credentials
2. Edit your OAuth 2.0 Client ID
3. Add your redirect URI (e.g., `http://localhost:3000/auth/callback/google`)
4. Ensure exact match (including trailing slashes)

#### Domain Validation Issues

**Cause**: User is not a member of the required Google Workspace domain.

**Solution**:

1. Verify user's email domain matches `hd` parameter
2. Check Google Workspace admin settings
3. Ensure user is active in the organization

#### Token Verification Failures

**Cause**: Invalid audience, issuer, or signature.

**Solution**:

1. Verify `audience` matches your Client ID
2. Check `issuer` is `https://accounts.google.com`
3. Ensure system clock is synchronized (token expiration check)

## Running Tests

### Mock Provider

```typescript
import { createMockAuthProvider } from '@package/auth';

const mockAuth = createMockAuthProvider({
  name: 'test-auth',
  latency: 10, // Simulate latency in ms
  failureRate: 0.01 // 1% failure rate
});

await mockAuth.authenticate({ username: 'test', password: 'test' });
```

### Running Tests

```bash
# All tests (mocks only - no external dependencies)
pnpm nx test auth

# Unit tests only
pnpm run test:unit
```

## Architecture

### Multi-Provider Support

The package uses a factory pattern to support multiple auth providers:

1. **Provider Interface** - `IAuthProvider` defines the contract
2. **Provider Factory** - Creates and manages provider instances
3. **Provider Implementations** - Custom JWT, Google OAuth, Google Identity Platform, and Keycloak
4. **Base Provider** - Common functionality with OpenTelemetry metrics

### Token Storage

- Refresh tokens are stored in Redis with tenant-scoped keys
- Token rotation is supported (old tokens are revoked on refresh)
- Access tokens can be blacklisted (useful for logout)
- Sessions track active tokens per user

### Multi-Tenancy

- JWT tokens must include `tenant_id` claim
- Redis keys are tenant-prefixed to isolate data
- Guards validate tenant context

## Best Practices

### General Best Practices

1. **Token Rotation** - Enable token rotation for better security
2. **Token Blacklisting** - Blacklist access tokens on logout
3. **Role-Based Access** - Use roles for coarse-grained access control
4. **Permission-Based Access** - Use permissions for fine-grained access control
5. **Multi-Tenancy** - Always include tenant_id in tokens
6. **Monitoring** - Enable OpenTelemetry metrics for auth operations
7. **Error Handling** - Handle auth errors gracefully

### Rate Limiting

Rate limiting is **critical** for authentication endpoints to prevent brute force attacks and ensure service availability.

#### Why Rate Limiting Matters

- **Brute Force Prevention**: Limits password guessing attempts
- **DDoS Protection**: Prevents resource exhaustion from massive request floods
- **Cost Control**: Limits calls to external auth providers (Keycloak, Google, etc.)
- **Fair Usage**: Ensures equitable resource distribution

#### Recommended Rate Limits

```typescript
// Using @nestjs/throttler or similar rate limiting library
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'auth',
        ttl: 60000, // 1 minute window
        limit: 10 // Max 10 requests per minute
      },
      {
        name: 'strict',
        ttl: 60000, // 1 minute window
        limit: 5 // Max 5 requests per minute
      }
    ])
  ]
})
export class AppModule {}
```

#### Endpoint-Specific Limits

| Endpoint                     | Limit          | Window   | Rationale                            |
| ---------------------------- | -------------- | -------- | ------------------------------------ |
| `POST /auth/login`           | 5-10 requests  | 1 minute | Prevent brute force password attacks |
| `POST /auth/register`        | 3-5 requests   | 1 hour   | Prevent bulk account creation        |
| `POST /auth/refresh`         | 10-20 requests | 1 minute | Prevent token refresh abuse          |
| `POST /auth/logout`          | 20 requests    | 1 minute | Allow for retries on network failure |
| `GET /auth/user`             | 100 requests   | 1 minute | Higher limit for legitimate API use  |
| `POST /auth/forgot-password` | 3 requests     | 1 hour   | Prevent email spam                   |
| `POST /auth/reset-password`  | 10 requests    | 1 hour   | Prevent abuse while allowing retries |

#### Implementation Example

```typescript
import { Controller, Post } from '@nestjs/common';
import { UseThrottler } from '@nestjs/throttler';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  // Strict rate limiting for login
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login() {
    // Login logic
  }

  // Stricter rate limiting for registration
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @Post('register')
  async register() {
    // Registration logic
  }

  // Moderate rate limiting for token refresh
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  async refresh() {
    // Token refresh logic
  }
}
```

#### IP-Based Rate Limiting

For production environments, implement IP-based rate limiting:

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): string {
    // Use IP address + user ID for tracking
    // This prevents sharing across multiple users behind same IP
    const ip = req.ip as string;
    const userId = (req.user as { id?: string })?.id;
    return userId ? `${ip}:${userId}` : ip;
  }
}
```

#### Redis-Based Distributed Rate Limiting

For multi-instance deployments, use Redis-backed rate limiting:

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerStorageRedisService } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 3 },
          { name: 'medium', ttl: 10000, limit: 20 },
          { name: 'long', ttl: 60000, limit: 100 }
        ],
        storage: new ThrottlerStorageRedisService(redis)
      })
    })
  ]
})
export class AppModule {}
```

#### Rate Limiting Best Practices

1. **Gradual Escalation**: Start with lenient limits, tighten based on usage patterns
2. **User-Specific Limits**: Consider higher limits for authenticated users with good standing
3. **Burst Allowance**: Allow short bursts within the window for legitimate retries
4. **Clear Messaging**: Return `429 Too Many Requests` with `Retry-After` header
5. **Monitoring**: Alert on excessive rate limit hits (may indicate attacks)
6. **Whitelisting**: Allow rate limit bypasses for trusted IPs/admins
7. **Geographic Awareness**: Consider stricter limits for high-risk regions

#### Response Headers

Include rate limit information in responses:

```typescript
{
  "message": "Rate limit exceeded",
  "statusCode": 429,
  "error": "Too Many Requests",
  "retryAfter": 45  // Seconds until limit resets
}

// Headers:
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706658900
Retry-After: 45
```

#### Monitoring and Alerting

Set up alerts for rate limiting:

```typescript
// Log rate limit events
this.logger.warn(`Rate limit exceeded: IP=${req.ip}, User=${userId}, Endpoint=${req.url}`);

// Alert on sustained abuse
if (consecutiveViolations > 100) {
  this.alertService.send({
    severity: 'high',
    message: 'Possible brute force attack detected',
    metadata: { ip: req.ip, violations: consecutiveViolations }
  });
}
```

### Google-Specific Best Practices

1. **OAuth 2.0 Flow Security**
   - Always use the authorization code flow (not implicit flow)
   - Implement PKCE (Proof Key for Code Exchange) for public clients
   - Validate the `state` parameter to prevent CSRF attacks
   - Use HTTPS for all redirect URIs

2. **Google Workspace Domain Validation**
   - Use the `hd` parameter to restrict authentication to your domain
   - Verify the `hd` claim in the ID token after authentication
   - Use the domain as tenant ID for multi-tenant applications

3. **Token Management**
   - Store refresh tokens securely in Redis
   - Implement token refresh before expiration (proactive refresh)
   - Blacklist access tokens on logout for immediate revocation
   - Handle token rotation (Google may return new refresh tokens)

4. **Error Handling**
   - Map Google-specific errors to user-friendly messages
   - Implement retry logic for network failures (with exponential backoff)
   - Log detailed errors for troubleshooting (without exposing sensitive data)

5. **Scopes**
   - Request only the scopes you need (principle of least privilege)
   - Common scopes: `openid`, `profile`, `email`
   - Google Workspace scopes: `https://www.googleapis.com/auth/admin.directory.group.readonly`

6. **Testing**
   - Use Google's OAuth 2.0 Playground for testing: https://developers.google.com/oauthplayground/
   - Test with both personal Google accounts and Google Workspace accounts
   - Mock Google API responses in unit tests

7. **Performance**
   - Cache Google's public keys for token verification
   - Set appropriate timeout values (default: 5000ms)
   - Implement lazy loading of the Google provider

## Dependencies

- `@opentelemetry/api` - OpenTelemetry integration
- `@nestjs/common` - NestJS support
- `@nestjs/passport` - Passport integration
- `@package/core` - Base infrastructure utilities
- `@package/redis` - Redis client for token storage
- `keycloak-connect` - Keycloak adapter
- `google-auth-library` - Google OAuth 2.0 and token verification
- `passport-jwt` - Passport JWT strategy

## Links

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Auth Library](https://github.com/googleapis/google-auth-library-nodejs)
- [Passport.js Documentation](http://www.passportjs.org/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [OpenTelemetry Documentation](https://opentelemetry.io/)
