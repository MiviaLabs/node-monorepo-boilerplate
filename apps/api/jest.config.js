module.exports = {
  displayName: 'API',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>'],
  // CRITICAL: setupFiles runs BEFORE modules are loaded - sets TEST_MODE=true
  // This prevents Redis/infrastructure from initializing real connections
  setupFiles: ['<rootDir>/test/jest.env-setup.ts'],
  // Run cleanup after all tests to close Redis connections
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts'
    // E2E tests excluded - they require Testcontainers database setup
    // Run E2E tests via: pnpm nx test api-e2e or jest.e2e.config.js
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  modulePathIgnorePatterns: ['/dist/'],
  // Unit test timeout (10 seconds is sufficient for non-E2E tests)
  testTimeout: 10000,
  transform: {
    '^.+\\.m?js$': ['@swc/jest', { swcrc: false, module: { type: 'commonjs' } }],
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        // CRITICAL: useESM must be false because esbuild (used when useESM=true) doesn't support parameter decorators
        // NestJS requires @Inject(), @Optional(), and other parameter decorators for DI
        useESM: false,
        isolatedModules: false,
        // CRITICAL: Enable decorated ts-jest transform for proper decorator metadata
        // This ensures NestJS DI can resolve parameter decorators
        astTransformers: {
          before: []
        }
      }
    ]
  },
  // CRITICAL: Transform workspace packages that are loaded via moduleNameMapper
  // Without this, packages won't be properly transpiled by ts-jest
  transformIgnorePatterns: [
    'node_modules/(?!@nestjs/|@package/|\\.pnpm/.*node_modules/(?:@nestjs|@package)/)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@src/(.*)$': '<rootDir>/src/$1',
    // Resolve workspace packages to source for reproducible local unit tests.
    // This removes implicit dependence on pre-built dist outputs.
    '^@package/auth$': '<rootDir>/../../packages/auth/src',
    '^@package/db-core$': '<rootDir>/../../packages/db-core/src',
    '^@package/db-outbox$': '<rootDir>/../../packages/db-outbox/src',
    '^@package/test-utils$': '<rootDir>/../../packages/test-utils/src',
    '^@package/types$': '<rootDir>/../../packages/types/src',
    '^@package/utils$': '<rootDir>/../../packages/utils/src',
    '^@package/schema$': '<rootDir>/../../packages/schema/src',
    '^@package/constants$': '<rootDir>/../../packages/constants/src',
    '^@package/errors$': '<rootDir>/../../packages/errors/src',
    '^@package/core$': '<rootDir>/../../packages/core/src',
    '^@package/events$': '<rootDir>/../../packages/events/src',
    '^@package/email$': '<rootDir>/../../packages/email/src',
    '^@package/email/webhooks$': '<rootDir>/../../packages/email/src/webhooks',
    '^@package/observability$': '<rootDir>/../../packages/observability/src',
    '^@package/opa$': '<rootDir>/../../packages/opa/src',
    '^@package/queues$': '<rootDir>/../../packages/queues/src',
    '^@package/redis$': '<rootDir>/../../packages/redis/src',
    '^@package/encryption$': '<rootDir>/../../packages/encryption/src',
    '^@package/storage$': '<rootDir>/../../packages/storage/src',
    '^@package/storage/nest$': '<rootDir>/../../packages/storage/src/nest.ts',
    '^@package/pubsub$': '<rootDir>/../../packages/pubsub/src',
    '^@package/tasks$': '<rootDir>/../../packages/tasks/src',
    '^@package/secrets$': '<rootDir>/../../packages/secrets/src',
    '^@package/i18n$': '<rootDir>/../../packages/i18n/src',
    '^@package/foundation-cqrs$': '<rootDir>/../../packages/foundation-cqrs/src',
    '^@package/foundation-repositories$': '<rootDir>/../../packages/foundation-repositories/src',
    '^@package/foundation-validation$': '<rootDir>/../../packages/foundation-validation/src'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.constants.ts'
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: 'coverage',
  detectOpenHandles: true
};
