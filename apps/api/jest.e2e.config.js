// Detect CI environment (GitHub Actions, GitLab CI, Jenkins, etc.)
const isCI = process.env.CI === 'true' || process.env.CI === '1' || !!process.env.GITHUB_ACTIONS;

module.exports = {
  displayName: 'API E2E',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>'],
  setupFiles: ['<rootDir>/test/jest.e2e-env-setup.ts'],
  testMatch: ['<rootDir>/test/**/*e2e.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  modulePathIgnorePatterns: ['/dist/'],
  // E2E tests may take longer (10 seconds is too short for Testcontainers setup)
  testTimeout: 60000,
  // Always detect open handles to identify resource leaks
  detectOpenHandles: true,
  // Force exit only in CI to prevent hanging builds
  // In local dev, let Jest wait so developers can see open handle warnings
  // TODO: Properly close all Kafka/Testcontainers/DB connections in teardown hooks
  forceExit: isCI,
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
    '^(\\.{1,2}\\/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@src/(.*)$': '<rootDir>/src/$1',
    // CRITICAL: Hybrid approach for decorator metadata preservation
    // - Packages with decorators (auth) point to dist/ to use pre-built JavaScript with correct metadata
    // - Source-only packages (types, utils, etc.) point to src/ and rely on ts-jest transpilation
    // This works because auth package (with guards using Reflector) uses pre-built dist
    // while other packages without complex decorators work fine from source
    '^@package/auth$': '<rootDir>/../../dist/packages/auth/src',
    // All other packages point to src/ (they work fine with ts-jest transpilation)
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
  }
};
