// Pure functions and immutability patterns
module.exports = {
  rules: {
    'no-var': 'error',
    'prefer-const': 'error',
    'no-let': 'off', // Too restrictive for gradual migration
    'no-param-reassign': 'warn', // Downgrade to warn
    'no-plusplus': 'off', // Allow for loops
    'prefer-arrow-callback': 'warn', // Downgrade to warn
    'prefer-spread': 'warn', // Downgrade to warn
    'prefer-rest-params': 'warn'
  }
};
