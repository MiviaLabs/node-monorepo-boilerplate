module.exports = {
  displayName: 'test-utils',
  testEnvironment: 'node',
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  rootDir: '.',
  roots: ['<rootDir>'],
  // Set TEST_MODE before modules load
  setupFiles: ['<rootDir>/test/jest.env-setup.ts'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/tests/**/*.test.ts'
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 10000,
  transform: {
    '^.+\\.ts$': ['@swc/jest', { swcrc: false, module: { type: 'commonjs' } }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
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
