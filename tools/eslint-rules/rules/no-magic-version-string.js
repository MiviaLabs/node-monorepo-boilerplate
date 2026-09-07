/**
 * Custom ESLint rule: no-magic-version-string
 *
 * Enforces importing version strings from config instead of hardcoding them.
 * Catches patterns like: `version: '1.0.0'` or `version: '2.1.0'`
 *
 * Rationale:
 * - Version strings should be single source of truth
 * - Hardcoded version strings can become stale
 * - Importing from config makes it easier to update versions
 * - Prevents inconsistencies across the codebase
 */

const VERSION_REGEX =
  /^['"`](0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?['"`]$/;

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hardcoded version strings, import from config instead',
      category: 'Best Practices',
      recommended: true
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedNames: {
            type: 'array',
            items: {
              type: 'string'
            }
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      importVersionFromConfig:
        'Hardcoded version string "{{version}}" should be imported from version config. ' +
        'Use:\n' +
        '```typescript\n' +
        "import { APP_VERSION } from '@/config/version.config';\n" +
        '```\n' +
        'or\n' +
        '```typescript\n' +
        "import { version } from '@/package.json';\n" +
        '```\n' +
        'This ensures version is single source of truth.'
    }
  },
  create(context) {
    const options = context.options[0] || {};
    const allowedNames = new Set(options.allowedNames || ['version', 'apiVersion', 'appVersion']);

    /**
     * Check if a property name is allowed to have version string
     * @param {string} name - Property name
     * @returns {boolean}
     */
    function isAllowedPropertyName(name) {
      return allowedNames.has(name);
    }

    /**
     * Check if a value is a version string literal
     * @param {object} node - AST node
     * @returns {boolean}
     */
    function isVersionStringLiteral(node) {
      if (!node) {
        return false;
      }

      // Check for string literal
      if (node.type === 'Literal' && typeof node.value === 'string') {
        return VERSION_REGEX.test(node.value);
      }

      // Check for template literals without expressions
      if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        const value = node.quasis.map((q) => q.value.cooked).join('');
        return VERSION_REGEX.test(value);
      }

      return false;
    }

    return {
      // Check object properties
      Property(node) {
        // Only check if key is a property named 'version' or similar
        if (node.key.type === 'Identifier' && isAllowedPropertyName(node.key.name)) {
          if (isVersionStringLiteral(node.value)) {
            context.report({
              node,
              messageId: 'importVersionFromConfig',
              data: { version: node.value.value || node.value.quasis[0].value.cooked }
            });
          }
        }

        // Also check computed properties with literal key like ['version']
        if (
          node.key.type === 'Literal' &&
          typeof node.key.value === 'string' &&
          isAllowedPropertyName(node.key.value)
        ) {
          if (isVersionStringLiteral(node.value)) {
            context.report({
              node,
              messageId: 'importVersionFromConfig',
              data: { version: node.value.value }
            });
          }
        }
      },

      // Check variable declarations: const version = '1.0.0'
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && isAllowedPropertyName(node.id.name)) {
          if (isVersionStringLiteral(node.init)) {
            context.report({
              node,
              messageId: 'importVersionFromConfig',
              data: { version: node.init.value }
            });
          }
        }
      },

      // Check return statements: return { version: '1.0.0' }
      ReturnStatement(node) {
        if (node.argument && node.argument.type === 'ObjectExpression') {
          node.argument.properties.forEach((prop) => {
            if (
              prop.type === 'Property' &&
              prop.key.type === 'Identifier' &&
              isAllowedPropertyName(prop.key.name)
            ) {
              if (isVersionStringLiteral(prop.value)) {
                context.report({
                  node: prop,
                  messageId: 'importVersionFromConfig',
                  data: { version: prop.value.value }
                });
              }
            }
          });
        }
      },

      // Check object expressions in function calls
      CallExpression(node) {
        if (node.arguments) {
          node.arguments.forEach((arg) => {
            if (arg.type === 'ObjectExpression') {
              arg.properties.forEach((prop) => {
                if (
                  prop.type === 'Property' &&
                  prop.key.type === 'Identifier' &&
                  isAllowedPropertyName(prop.key.name)
                ) {
                  if (isVersionStringLiteral(prop.value)) {
                    context.report({
                      node: prop,
                      messageId: 'importVersionFromConfig',
                      data: { version: prop.value.value }
                    });
                  }
                }
              });
            }
          });
        }
      }
    };
  }
};
