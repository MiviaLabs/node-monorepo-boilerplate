/**
 * Custom ESLint plugin for Node Monorepo Boilerplate
 *
 * Provides rules to enforce:
 * - Using const enums instead of union literal types
 * - Importing version strings from config instead of hardcoding
 */

const noMagicVersionString = require('./rules/no-magic-version-string');
const preferConstEnum = require('./rules/prefer-const-enum');

module.exports = {
  rules: {
    'prefer-const-enum': preferConstEnum,
    'no-magic-version-string': noMagicVersionString
  }
};
