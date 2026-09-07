/**
 * Jest config for decorator-dependent tests only (queues.module wiring).
 *
 * tsx/esbuild cannot transform PARAMETER decorators (esbuild limitation), so
 * `queues.module.unit.test.ts` runs under jest + @swc/jest with legacy
 * decorators enabled. All other queues tests run under node:test via tsx
 * (see the `test` target in project.json).
 */
module.exports = {
  displayName: 'queues-module',
  testEnvironment: 'node',
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  rootDir: '.',
  roots: ['<rootDir>'],
  testMatch: ['<rootDir>/src/__tests__/queues.module.unit.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 10000,
  transform: {
    '^.+\\.m?js$': ['@swc/jest', { swcrc: false, module: { type: 'commonjs' } }],
    '^.+\\.ts$': [
      '@swc/jest',
      {
        swcrc: false,
        module: { type: 'commonjs' },
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true }
        }
      }
    ]
  },
  // @nestjs@12 ships ESM-only; transpile it (and workspace sources) to CJS.
  transformIgnorePatterns: [
    'node_modules/(?!@nestjs/|@package/|\\.pnpm/.*node_modules/(?:@nestjs|@package)/)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@package/core$': '<rootDir>/../../packages/core/src',
    '^@package/errors$': '<rootDir>/../../packages/errors/src',
    '^@package/constants$': '<rootDir>/../../packages/constants/src',
    '^@package/types$': '<rootDir>/../../packages/types/src',
    '^@package/utils$': '<rootDir>/../../packages/utils/src',
    '^@package/observability$': '<rootDir>/../../packages/observability/src',
    '^@package/redis$': '<rootDir>/../../packages/redis/src',
    '^@package/pubsub$': '<rootDir>/../../packages/pubsub/src',
    '^@package/tasks$': '<rootDir>/../../packages/tasks/src'
  },
  moduleFileExtensions: ['ts', 'js', 'json']
};
