const path = require('path');

// Import modular ESLint configs (rules only, plugins registered in main config)
const { base, typescript, react, nestjs, security, formatting, pure } = require('./tools/eslint');

module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    '.next',
    'coverage',
    '.nx',
    'tmp',
    '.nx/cache',
    '**/examples/**',
    '**/__mocks__/**',
    '**/__fixtures__/**',
    '**/package.json',
    '**/next-env.d.ts',
    'scripts/**'
  ],
  plugins: [
    '@typescript-eslint',
    '@nx',
    'import',
    'prettier',
    'local-rules',
    'react',
    'react-hooks',
    'jsx-a11y'
  ],
  overrides: [
    // ESLint config files should use standard parser, not TypeScript
    {
      files: ['.eslintrc.js', 'eslint.config.js', 'tools/eslint/**/*.js'],
      parser: 'espree',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      rules: {
        ...base.rules,
        'import/order': base.rules['import/order']
      }
    },
    // Base TypeScript/JavaScript files
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {
        // Register custom local rules
        'local-rules/prefer-const-enum': 'error',
        'local-rules/no-magic-version-string': 'error',
        // Nx module boundaries
        '@nx/enforce-module-boundaries': [
          'error',
          {
            enforceBuildableLibDependency: true,
            depConstraints: [
              {
                sourceTag: 'scope:primitive',
                onlyDependOnLibsWithTags: ['scope:primitive']
              },
              {
                sourceTag: 'scope:platform',
                onlyDependOnLibsWithTags: ['scope:primitive', 'scope:platform']
              },
              {
                sourceTag: 'scope:infra',
                onlyDependOnLibsWithTags: ['scope:primitive', 'scope:platform', 'scope:infra']
              },
              {
                sourceTag: 'scope:domain',
                onlyDependOnLibsWithTags: [
                  'scope:primitive',
                  'scope:platform',
                  'scope:infra',
                  'scope:domain'
                ]
              },
              {
                // Intentional wildcard: dev-only test helpers may wire infra.
                sourceTag: 'scope:tool',
                onlyDependOnLibsWithTags: ['*']
              },
              {
                sourceTag: 'scope:app',
                onlyDependOnLibsWithTags: [
                  'scope:primitive',
                  'scope:platform',
                  'scope:infra',
                  'scope:domain'
                ]
              }
            ]
          }
        ],
        // General rules
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        complexity: ['warn', 15],
        // Pure and immutable patterns
        ...pure.rules
      }
    },
    // TypeScript files - base + typescript + security + formatting
    {
      files: ['*.ts', '*.tsx'],
      excludedFiles: ['packages/**/__mocks__/**/*.ts', 'packages/**/__fixtures__/**/*.ts'],
      extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended'
      ],
      rules: {
        ...base.rules,
        ...typescript.rules,
        ...security.rules,
        ...formatting.rules
      }
    },
    // TypeScript backend (API) files - add NestJS rules
    {
      files: ['apps/api/**/*.ts'],
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './apps/api/tsconfig.app.json'
      },
      extends: ['plugin:@typescript-eslint/recommended-type-checked'],
      rules: {
        ...nestjs.rules,
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off'
      },
      excludedFiles: ['**/*.test.ts', '**/*.spec.ts']
    },
    // TypeScript package files - don't use type-checked rules for lint-staged
    {
      files: ['packages/**/*.ts'],
      excludedFiles: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/examples/**',
        '**/__mocks__/**',
        '**/__tests__/**'
      ],
      rules: {
        // Disable type-checked rules that require tsconfig project
        '@typescript-eslint/consistent-type-exports': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/prefer-optional-chain': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off'
      }
    },
    // TypeScript frontend (Web) files - add React rules
    {
      files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './apps/web/tsconfig.json'
      },
      rules: {
        ...react.rules,
        // Disable type-checked rules for web app (Task 001: relaxed rules like packages)
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/strict-boolean-expressions': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/no-import-type-side-effects': 'off'
      },
      excludedFiles: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx']
    },
    // TypeScript frontend (Admin) files - add React rules
    {
      files: ['apps/admin/**/*.ts', 'apps/admin/**/*.tsx'],
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './apps/admin/tsconfig.json'
      },
      rules: {
        ...react.rules,
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/strict-boolean-expressions': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/no-import-type-side-effects': 'off'
      },
      excludedFiles: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx']
    },
    // Generated shadcn/ui components in admin - keep upstream template shapes intact
    {
      files: [
        'apps/admin/src/components/ui/**/*.tsx',
        'apps/admin/src/hooks/use-mobile.tsx'
      ],
      rules: {
        'local-rules/prefer-const-enum': 'off',
        'no-param-reassign': 'off'
      }
    },
    // Test files in API app - relaxed rules
    {
      files: [
        'apps/api/**/*.test.ts',
        'apps/api/**/*.test.tsx',
        'apps/api/**/*.spec.ts',
        'apps/api/**/*.spec.tsx',
        'apps/api/test/**/*.ts'
      ],
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './apps/api/tsconfig.spec.json'
      },
      extends: ['plugin:@typescript-eslint/recommended-type-checked'],
      rules: {
        '@typescript-eslint/typedef': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/require-await': 'off',
        'max-lines-per-function': 'off',
        'no-let': 'off' // Allow let in tests
      }
    },
    // Test files in Web app - use relaxed rules without type-checking
    {
      files: [
        'apps/web/**/*.test.ts',
        'apps/web/**/*.test.tsx',
        'apps/web/**/*.spec.ts',
        'apps/web/**/*.spec.tsx'
      ],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/typedef': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/prefer-optional-chain': 'off',
        '@typescript-eslint/consistent-type-exports': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'max-lines-per-function': 'off',
        'no-let': 'off' // Allow let in tests
      }
    },
    // Test files in Admin app - use relaxed rules without type-checking
    {
      files: [
        'apps/admin/**/*.test.ts',
        'apps/admin/**/*.test.tsx',
        'apps/admin/**/*.spec.ts',
        'apps/admin/**/*.spec.tsx'
      ],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/typedef': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/prefer-optional-chain': 'off',
        '@typescript-eslint/consistent-type-exports': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'max-lines-per-function': 'off',
        'no-let': 'off'
      }
    },
    // Test files in Admin E2E app - use relaxed rules without type-checking
    {
      files: [
        'apps/admin-e2e/**/*.test.ts',
        'apps/admin-e2e/**/*.test.tsx',
        'apps/admin-e2e/**/*.spec.ts',
        'apps/admin-e2e/**/*.spec.tsx'
      ],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/typedef': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/prefer-optional-chain': 'off',
        '@typescript-eslint/consistent-type-exports': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'max-lines-per-function': 'off',
        'no-let': 'off'
      }
    },
    // Test files in packages - use relaxed rules without type-checking
    {
      files: [
        'packages/**/*.test.ts',
        'packages/**/*.test.tsx',
        'packages/**/*.spec.ts',
        'packages/**/*.spec.tsx',
        'packages/**/__tests__/**/*.ts',
        'packages/**/__tests__/**/*.tsx'
      ],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/typedef': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/prefer-optional-chain': 'off',
        '@typescript-eslint/consistent-type-exports': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'max-lines-per-function': 'off',
        'no-let': 'off' // Allow let in tests
      }
    },
    // Mocks and fixtures in packages - disable type-checking rules
    {
      files: ['packages/**/__mocks__/**/*.ts', 'packages/**/__fixtures__/**/*.ts'],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/consistent-type-exports': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off'
      }
    },
    // JavaScript files
    {
      files: ['*.js', '*.jsx'],
      extends: ['plugin:@nx/javascript'],
      rules: {
        'no-empty-function': [
          'error',
          {
            allow: []
          }
        ]
      }
    }
  ]
};
