module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
        'hotfix',
        'security',
        'compliance',
        'release'
      ]
    ],
    'scope-enum': [
      2,
      'always',
      [
        'auth',
        'database',
        'api',
        'web',
        'ai',
        'encrypted-store',
        'monitoring',
        'security',
        'infra',
        'deps',
        'ci',
        'core',
        'platform',
        'backend',
        'frontend',
        'mobile',
        'data',
        'analytics',
        'observability',
        'sre',
        'devops',
        'compliance',
        'governance',
        'risk',
        'privacy',
        'iam',
        'billing',
        'payments',
        'notifications',
        'integrations',
        'docs',
        'dx',
        'onboarding'
      ]
    ],
    'subject-case': [0],
    'body-max-line-length': [0]
  }
};
