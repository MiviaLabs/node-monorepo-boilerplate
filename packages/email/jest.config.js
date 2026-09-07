module.exports = {
  displayName: 'email',
  testEnvironment: 'node',
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  rootDir: '.',
  roots: ['<rootDir>'],
  // Set TEST_MODE before modules load
  setupFiles: ['<rootDir>/test/jest.env-setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 10000,
  transform: {
    '^.+\\.ts$': ['@swc/jest', { swcrc: false, module: { type: 'commonjs' } }]
  },
  // CRITICAL: Transform workspace packages that are loaded via moduleNameMapper
  transformIgnorePatterns: ['node_modules/(?!(?:@package)/)'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Resolve workspace packages to source for reproducible local unit tests.
    '^@package/core$': '<rootDir>/../../packages/core/src',
    '^@package/errors$': '<rootDir>/../../packages/errors/src',
    '^@package/constants$': '<rootDir>/../../packages/constants/src',
    '^@package/types$': '<rootDir>/../../packages/types/src',
    '^@package/utils$': '<rootDir>/../../packages/utils/src',
    '^@package/schema$': '<rootDir>/../../packages/schema/src',
    '^@package/observability$': '<rootDir>/../../packages/observability/src',
    '^@package/queues$': '<rootDir>/../../packages/queues/src',
    '^@package/redis$': '<rootDir>/../../packages/redis/src'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**'
  ]
};
