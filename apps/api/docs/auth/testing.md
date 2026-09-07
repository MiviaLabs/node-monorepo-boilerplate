# Testing

How to test authentication with `@package/auth` using the mock provider.

## Overview

The auth package provides a mock auth provider for testing without external dependencies like Keycloak or Redis.

## Mock Provider

### What is Mock Provider?

Mock provider simulates authentication responses without calling external auth providers. It provides:

- Deterministic test behavior
- Fast test execution (no network calls)
- Configurable latency and failure rates
- No infrastructure dependencies

### Setup

```typescript
import { Test } from '@nestjs/testing';
import { createMockAuthProvider } from '@package/auth';

describe('UsersController', () => {
  let controller: UsersController;
  let mockAuth: IAuthProvider;

  beforeEach(async () => {
    mockAuth = createMockAuthProvider({
      name: 'test-auth',
      latency: 0, // No latency in tests
      failureRate: 0 // No failures in tests
    });

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        {
          provide: 'AUTH_PROVIDER',
          useValue: mockAuth
        }
      ]
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });
});
```

### Configuration Options

```typescript
interface MockAuthProviderOptions {
  name: string; // Provider name
  latency?: number; // Simulated latency in ms (default: 10)
  failureRate?: number; // Failure rate 0-1 (default: 0)
  users?: Map<
    string,
    {
      // Pre-configured users
      password: string;
      tenantId: string;
      roles: string[];
      permissions: string[];
    }
  >;
}
```

## Unit Tests

### Test Controller with Auth

```typescript
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '@package/auth';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            sub: 'test-user-id',
            tenant_id: 'test-tenant-id',
            email: 'test@example.com',
            roles: ['user'],
            permissions: ['users:read']
          };
          return true;
        }
      })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should return user profile', async () => {
    const result = await controller.getProfile();
    expect(result).toHaveProperty('email', 'test@example.com');
  });
});
```

### Test Guard

```typescript
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
      headers: {
        authorization: 'Bearer valid-token'
      },
      user: {
        sub: 'user-123',
        tenant_id: 'tenant-456'
      }
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should deny missing token', async () => {
    const context = createMockExecutionContext({
      headers: {}
    });

    await expect(guard.canActivate(context)).rejects.toThrow();
  });
});

// Helper function
function createMockExecutionContext(request: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: () => ({}),
    getClass: () => ({})
  } as ExecutionContext;
}
```

### Test Service with Mock Auth

```typescript
describe('AuthService', () => {
  let service: AuthService;
  let mockAuth: IAuthProvider;

  beforeEach(async () => {
    mockAuth = createMockAuthProvider({
      name: 'test-auth',
      users: new Map([
        [
          'test@example.com',
          {
            password: 'password',
            tenantId: 'tenant-123',
            roles: ['user'],
            permissions: ['users:read']
          }
        ]
      ])
    });

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: 'AUTH_PROVIDER',
          useValue: mockAuth
        }
      ]
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should authenticate valid user', async () => {
    const result = await service.authenticate({
      username: 'test@example.com',
      password: 'password',
      tenantId: 'tenant-123'
    });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });

  it('should reject invalid credentials', async () => {
    await expect(
      service.authenticate({
        username: 'test@example.com',
        password: 'wrong-password',
        tenantId: 'tenant-123'
      })
    ).rejects.toThrow();
  });
});
```

## Integration Tests

### Test with Mock Provider

```typescript
import { Test } from '@nestjs/testing';
import { createMockAuthProvider } from '@package/auth';

describe('Auth Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        AuthModule.forRoot({
          providers: [
            {
              name: 'test-auth',
              default: true,
              provider: createMockAuthProvider({
                name: 'test-auth',
                latency: 0,
                failureRate: 0
              })
            }
          ],
          jwt: {
            secretOrKey: 'test-secret',
            ignoreExpiration: true
          },
          tokenStorage: {
            enabled: false // Disable Redis in tests
          }
        })
      ]
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should authenticate user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: 'test@example.com',
        password: 'password',
        tenantId: 'tenant-123'
      })
      .expect(201);

    expect(response.body).toHaveProperty('accessToken');
  });
});
```

## E2E Tests

### Test Protected Routes

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';

describe('Auth E2E Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = app.get<JwtService>(JwtService);

    // Generate test token
    authToken = jwtService.sign({
      sub: 'test-user-id',
      tenant_id: 'test-tenant-id',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['users:read']
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should deny access without token', () => {
    return request(app.getHttpServer()).get('/users/profile').expect(401);
  });

  it('should allow access with valid token', () => {
    return request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  it('should deny access with expired token', () => {
    const expiredToken = jwtService.sign(
      {
        sub: 'test-user-id',
        tenant_id: 'test-tenant-id'
      },
      { expiresIn: '-1h' }
    );

    return request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('should enforce role-based access', () => {
    const userToken = jwtService.sign({
      sub: 'user-id',
      tenant_id: 'tenant-id',
      roles: ['user'] // Not admin
    });

    return request(app.getHttpServer())
      .delete('/admin/users/test-id')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403); // Forbidden
  });

  it('should enforce permission-based access', () => {
    const userToken = jwtService.sign({
      sub: 'user-id',
      tenant_id: 'tenant-id',
      permissions: ['users:read'] // No write permission
    });

    return request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403); // Forbidden
  });
});
```

### Test Multi-Tenancy

```typescript
describe('Multi-Tenancy E2E Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = app.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should isolate tenant data', async () => {
    const tenant1Token = jwtService.sign({
      sub: 'user-1',
      tenant_id: 'tenant-1'
    });

    const tenant2Token = jwtService.sign({
      sub: 'user-2',
      tenant_id: 'tenant-2'
    });

    // Create post in tenant-1
    await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${tenant1Token}`)
      .send({ title: 'Tenant 1 Post' })
      .expect(201);

    // Try to access from tenant-2
    const response = await request(app.getHttpServer())
      .get('/posts')
      .set('Authorization', `Bearer ${tenant2Token}`)
      .expect(200);

    // Should not see tenant-1's post
    expect(response.body.items).toHaveLength(0);
  });
});
```

## Test Fixtures

### Mock Users Fixture

```typescript
// test/fixtures/users.fixture.ts
export const mockUsers = {
  admin: {
    id: 'admin-123',
    email: 'admin@example.com',
    password: 'admin-password',
    tenantId: 'tenant-123',
    roles: ['admin'],
    permissions: ['*']
  },
  user: {
    id: 'user-123',
    email: 'user@example.com',
    password: 'user-password',
    tenantId: 'tenant-123',
    roles: ['user'],
    permissions: ['users:read', 'posts:read']
  }
};

export function generateToken(user: keyof typeof mockUsers): string {
  const mockUser = mockUsers[user];
  return jwtService.sign({
    sub: mockUser.id,
    tenant_id: mockUser.tenantId,
    email: mockUser.email,
    roles: mockUser.roles,
    permissions: mockUser.permissions
  });
}
```

### Usage in Tests

```typescript
describe('Tests with Fixtures', () => {
  it('should access admin endpoint', async () => {
    const adminToken = generateToken('admin');

    await request(app.getHttpServer())
      .delete('/admin/users/test-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
```

## Test Utilities

### Auth Test Helper

```typescript
// test/helpers/auth.helper.ts
import { JwtService } from '@nestjs/jwt';

export class AuthTestHelper {
  constructor(private readonly jwtService: JwtService) {}

  generateToken(payload: any): string {
    return this.jwtService.sign(payload);
  }

  generateUserToken(overrides: Partial<any> = {}): string {
    return this.generateToken({
      sub: 'test-user-id',
      tenant_id: 'test-tenant-id',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['users:read'],
      ...overrides
    });
  }

  generateAdminToken(overrides: Partial<any> = {}): string {
    return this.generateToken({
      sub: 'admin-id',
      tenant_id: 'admin-tenant-id',
      email: 'admin@example.com',
      roles: ['admin'],
      permissions: ['*'],
      ...overrides
    });
  }

  async authenticatedRequest(
    app: INestApplication,
    method: string,
    url: string,
    token?: string,
    body?: any
  ) {
    const req = request(app.getHttpServer())[method.toLowerCase()](url);

    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }

    if (body) {
      req.send(body);
    }

    return req;
  }
}
```

### Usage

```typescript
describe('Tests with Helper', () => {
  let authHelper: AuthTestHelper;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    const app = module.createNestApplication();
    await app.init();

    const jwtService = app.get<JwtService>(JwtService);
    authHelper = new AuthTestHelper(jwtService);
  });

  it('should access protected route', async () => {
    const token = authHelper.generateUserToken();

    await authHelper.authenticatedRequest(app, 'GET', '/users/profile', token).expect(200);
  });
});
```

## Best Practices

1. **Use mock provider** - Avoid external dependencies in tests
2. **Disable Redis in tests** - Use `enabled: false` for tokenStorage
3. **Test guards** - Verify authentication and authorization
4. **Test multi-tenancy** - Ensure tenant isolation
5. **Use fixtures** - Reusable test data
6. **Create test helpers** - Reduce test code duplication
7. **Test error cases** - Invalid tokens, expired tokens, wrong roles
8. **Mock only auth** - Keep other dependencies real when possible

## Next Steps

- [Quick Start Guide](./quick-start.md) - Get started quickly
- [Configuration Guide](./configuration.md) - Test configuration options
