import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import jsoncParser from 'jsonc-eslint-parser';

import rootConfig from './.eslintrc.js';

const require = createRequire(import.meta.url);
const baseDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory,
  recommendedConfig: js.configs.recommended
});

// Typed-lint relaxations, ported 1:1 from the deleted per-package legacy
// .eslintrc.json files (which FlatCompat could not scope correctly — their
// '**/*.ts' override globs leaked parserOptions/rules across the whole repo).
const packageRuleRelaxations = {
  'packages/email': {
    '@typescript-eslint/consistent-type-exports': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off'
  },
  'packages/encryption': {
    '@typescript-eslint/consistent-type-exports': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off'
  },
  'packages/events': {
    '@typescript-eslint/consistent-type-exports': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off'
  },
  'packages/observability': {
    '@typescript-eslint/consistent-type-exports': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off'
  },
  'packages/queues': {
    '@typescript-eslint/consistent-type-exports': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off'
  },
  'packages/redis': {},
  'packages/secrets': {},
  'packages/test-utils': {
    '@typescript-eslint/consistent-type-exports': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/await-thenable': 'off'
  }
};

const dependencyChecksRule = [
  'error',
  {
    ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}']
  }
];

const packageBlocks = [
  {
    // eslint-plugin-import@2.32 uses SourceCode.getTokenOrCommentAfter, which
    // ESLint 10 removed — 'import/order' crashes on some package files.
    // Re-enable after migrating to eslint-plugin-import-x (eslint >=10 safe).
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    rules: { 'import/order': 'off' }
  },
  {
    // Same eslint-plugin-import@2.32 + ESLint 10 incompatibility.
    // lint-staged runs eslint --fix on apps/api and apps/web, and the crash
    // also fires on apps/admin pages that re-export large barrel imports
    // (e.g. apps/api/src/app.module.ts line 1). Re-enable with import-x.
    files: [
      'apps/api/**/*.ts',
      'apps/api/**/*.tsx',
      'apps/web/**/*.{ts,tsx}',
      'apps/admin/**/*.{ts,tsx}',
      'apps/mobile/**/*.{ts,tsx}'
    ],
    rules: { 'import/order': 'off' }
  },
  {
    // Package tests: match the repo's existing per-package test relaxations
    // (jest.mock factories need require(); stubs use `any`; the const-enum
    // local rule targets production types, not fixtures).
    files: [
      'packages/**/*.test.ts',
      'packages/**/*.spec.ts',
      'packages/**/__tests__/**/*.ts'
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'local-rules/prefer-const-enum': 'off'
    }
  },
  {
    files: ['apps/api/test/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-unsafe-argument': 'off' }
  },
  ...Object.entries(packageRuleRelaxations).map(([dir, rules]) => ({
    files: [`${dir}/**/*.ts`, `${dir}/**/*.tsx`],
    ...(dir === 'packages/email'
      ? {
          languageOptions: {
            parserOptions: {
              project: [`${dir}/tsconfig.*.json`],
              tsconfigRootDir: baseDirectory
            }
          }
        }
      : {}),
    rules
  })),
  ...Object.keys(packageRuleRelaxations).map((dir) => ({
    files: [`${dir}/**/*.json`],
    languageOptions: { parser: jsoncParser },
    rules: {
      '@nx/dependency-checks': [
        'error',
        dir === 'packages/secrets'
          ? {
              ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
              ignoredDependencies: ['@opentelemetry/api']
            }
          : dependencyChecksRule[1]
      ]
    }
  }))
];

export default [
  ...compat.config(rootConfig),
  ...packageBlocks,
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./apps/api/tsconfig.app.json'],
        tsconfigRootDir: baseDirectory
      }
    }
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./apps/web/tsconfig.json', './apps/admin/tsconfig.json'],
        tsconfigRootDir: baseDirectory
      }
    }
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./apps/mobile/tsconfig.json'],
        tsconfigRootDir: baseDirectory
      }
    }
  },
  {
    files: [
      'apps/api/**/*.test.ts',
      'apps/api/**/*.spec.ts',
      'apps/api/test/**/*.ts'
    ],
    languageOptions: {
      parserOptions: {
        project: ['./apps/api/tsconfig.spec.json'],
        tsconfigRootDir: baseDirectory
      }
    }
  }
];
