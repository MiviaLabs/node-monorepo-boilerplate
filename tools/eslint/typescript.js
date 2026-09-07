module.exports = {
  rules: {
    // Additional strict TypeScript rules
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-expressions': [
      'error',
      {
        allowShortCircuit: true,
        allowTernary: true,
        allowTaggedTemplates: true
      }
    ],
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/typedef': 'off'
  }
};
