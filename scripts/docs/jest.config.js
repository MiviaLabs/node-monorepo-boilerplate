module.exports = {
  displayName: 'Docs-Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.nx/',
    '/dist/',
    '/packages/',
    '/apps/',
    '/__tests__/generate-mermaid.test.ts'
  ],
  modulePathIgnorePatterns: ['/node_modules/', '/.nx/', '/dist/', '/packages/', '/apps/'],
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../../tsconfig.base.json',
        useESM: false,
        diagnostics: false, // Disable type checking for jest tests
        isolatedModules: false
      }
    ]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:@package|@node-monorepo-boilerplate)/)',
    '.nx/',
    'dist/'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Resolve workspace packages to source
    '^@package/types$': '<rootDir>/../../packages/types/src',
    '^@package/constants$': '<rootDir>/../../packages/constants/src',
    '^@package/utils$': '<rootDir>/../../packages/utils/src',
    '^@package/errors$': '<rootDir>/../../packages/errors/src',
    '^@package/schema$': '<rootDir>/../../packages/schema/src',
    '^@package/core$': '<rootDir>/../../packages/core/src',
    '^@package/auth$': '<rootDir>/../../packages/auth/src',
    '^@package/i18n$': '<rootDir>/../../packages/i18n/src',
    '^@package/events$': '<rootDir>/../../packages/events/src',
    '^@package/observability$': '<rootDir>/../../packages/observability/src',
    '^@package/redis$': '<rootDir>/../../packages/redis/src',
    '^@package/queues$': '<rootDir>/../../packages/queues/src',
    '^@package/pubsub$': '<rootDir>/../../packages/pubsub/src',
    '^@package/tasks$': '<rootDir>/../../packages/tasks/src',
    '^@package/secrets$': '<rootDir>/../../packages/secrets/src',
    '^@package/encryption$': '<rootDir>/../../packages/encryption/src',
    '^@package/opa$': '<rootDir>/../../packages/opa/src',
    '^@package/db-core$': '<rootDir>/../../packages/db-core/src',
    '^@package/db-outbox$': '<rootDir>/../../packages/db-outbox/src',
    '^@package/test-utils$': '<rootDir>/../../packages/test-utils/src'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    '<rootDir>/**/*.ts',
    '!<rootDir>/**/__tests__/**',
    '!<rootDir>/**/*.test.ts',
    '!<rootDir>/**/*.spec.ts'
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
