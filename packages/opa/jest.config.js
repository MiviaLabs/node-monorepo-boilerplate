module.exports = {
  displayName: 'opa',
  testEnvironment: 'node',
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  rootDir: '.',
  roots: ['<rootDir>'],
  setupFiles: ['<rootDir>/test/jest.env-setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 10000,
  transform: {
    '^.+\\.m?js$': ['@swc/jest', { swcrc: false, module: { type: 'commonjs' } }],
    '^.+\\.ts$': [
      '@swc/jest',
      {
        swcrc: false,
        jsc: {
          parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
          transform: { legacyDecorator: true, decoratorMetadata: true }
        },
        module: { type: 'commonjs' }
      }
    ]
  },
  transformIgnorePatterns: [
    'node_modules/(?!@nestjs/|@package/|\\.pnpm/.*node_modules/(?:@nestjs|@package)/)'
  ],
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
