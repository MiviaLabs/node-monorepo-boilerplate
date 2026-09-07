const rootDir = __dirname;

module.exports = {
  projects: [
    {
      displayName: 'integration',
      testEnvironment: 'node',
      clearMocks: true,
      resetMocks: true,
      restoreMocks: true,
      rootDir,
      roots: ['<rootDir>'],
      testMatch: ['<rootDir>/src/**/__tests__/**/*.integration.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/dist/'],
      modulePathIgnorePatterns: ['/dist/'],
      testTimeout: 60000, // Longer timeout for Testcontainers
      transform: {
        '^.+\\.ts$': ['@swc/jest', { swcrc: false, module: { type: 'commonjs' } }]
      },
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      moduleFileExtensions: ['ts', 'js', 'json']
    },
    {
      displayName: 'unit',
      testEnvironment: 'node',
      clearMocks: true,
      resetMocks: true,
      restoreMocks: true,
      rootDir,
      roots: ['<rootDir>'],
      testMatch: ['<rootDir>/src/**/*.unit.test.ts', '<rootDir>/src/**/*.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/dist/'],
      modulePathIgnorePatterns: ['/dist/'],
      testTimeout: 10000,
      transform: {
        '^.+\\.ts$': ['@swc/jest', { swcrc: false, module: { type: 'commonjs' } }]
      },
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      moduleFileExtensions: ['ts', 'js', 'json']
    }
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**'
  ]
};
