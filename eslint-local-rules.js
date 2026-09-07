/**
 * ESLint Local Rules Entry Point
 * Required by eslint-plugin-local-rules
 *
 * This file MUST export rule objects directly (with meta and create properties).
 * It imports from tools/eslint-rules/ and re-exports them.
 *
 * Using __dirname to ensure absolute path resolution regardless of where
 * eslint-plugin-local-rules loads this file from.
 */

const path = require('path');

// Use __dirname to ensure absolute path resolution
const noMagicVersionString = require(
  path.join(__dirname, 'tools/eslint-rules/rules/no-magic-version-string')
);
const preferConstEnum = require(path.join(__dirname, 'tools/eslint-rules/rules/prefer-const-enum'));

module.exports = {
  'no-magic-version-string': noMagicVersionString,
  'prefer-const-enum': preferConstEnum
};
