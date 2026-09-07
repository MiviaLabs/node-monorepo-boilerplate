/**
 * Custom ESLint rule: prefer-const-enum
 *
 * Enforces using const enums instead of union literal types like:
 * - status: 'ok' | 'error'
 * - type: 'foo' | 'bar' | 'baz'
 *
 * Rationale:
 * - Union literals create magic strings/primitive literals in type annotations
 * - Const enums provide named constants that are self-documenting
 * - Const enums can be referenced in code without maintaining string literals
 * - Better for refactoring and avoiding typos
 *
 * Sources:
 * - https://github.com/typescript-eslint/typescript-eslint/issues/280
 * - https://github.com/typescript-eslint/typescript-eslint/issues/561
 */

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using const enums instead of union literal types',
      category: 'Best Practices',
      recommended: true
    },
    schema: [],
    messages: {
      useConstEnum:
        'Union literal type "{{type}}" should use a const enum instead. ' +
        'Create a const enum like:\n' +
        '```typescript\n' +
        'const enum Status {{\n' +
        '  Ok = "ok",\n' +
        '  Error = "error",\n' +
        '}}\n' +
        '```\n' +
        'Then use `status: Status` instead of `status: "ok" | "error"`. ' +
        'This makes the code more maintainable and prevents typos.'
    }
  },
  create(context) {
    /**
     * Check if a type is a union of string literals
     * @param {object} node - TypeScript type node
     * @returns {boolean}
     */
    function isStringLiteralUnionType(node) {
      if (!node) {
        return false;
      }

      // Check for TSUnionType
      if (node.type === 'TSUnionType') {
        return node.types.every(
          (type) =>
            type.type === 'TSLiteralType' &&
            type.literal.type === 'Literal' &&
            typeof type.literal.value === 'string'
        );
      }

      return false;
    }

    /**
     * Get the union type as a string for error message
     * @param {object} node - TSUnionType node
     * @returns {string}
     */
    function getUnionTypeString(node) {
      return node.types
        .map((type) => {
          if (type.literal && type.literal.value !== undefined) {
            return `"${type.literal.value}"`;
          }
          return '?';
        })
        .join(' | ');
    }

    return {
      // Check property definitions in interfaces and type aliases
      TSPropertySignature(node) {
        if (node.typeAnnotation && isStringLiteralUnionType(node.typeAnnotation.typeAnnotation)) {
          const typeName = getUnionTypeString(node.typeAnnotation.typeAnnotation);
          context.report({
            node,
            messageId: 'useConstEnum',
            data: { type: typeName }
          });
        }
      },

      // Check type alias declarations
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation && isStringLiteralUnionType(node.typeAnnotation)) {
          const typeName = getUnionTypeString(node.typeAnnotation);
          context.report({
            node,
            messageId: 'useConstEnum',
            data: { type: typeName }
          });
        }
      },

      // Check function parameter types
      FunctionDeclaration(node) {
        // Parameters in function declarations
        if (node.params) {
          node.params.forEach((param) => {
            if (
              param.typeAnnotation &&
              isStringLiteralUnionType(param.typeAnnotation.typeAnnotation)
            ) {
              const typeName = getUnionTypeString(param.typeAnnotation.typeAnnotation);
              context.report({
                node: param,
                messageId: 'useConstEnum',
                data: { type: typeName }
              });
            }
          });
        }
      },

      // Check class method parameters
      MethodDefinition(node) {
        if (node.value && node.value.params) {
          node.value.params.forEach((param) => {
            if (
              param.typeAnnotation &&
              isStringLiteralUnionType(param.typeAnnotation.typeAnnotation)
            ) {
              const typeName = getUnionTypeString(param.typeAnnotation.typeAnnotation);
              context.report({
                node: param,
                messageId: 'useConstEnum',
                data: { type: typeName }
              });
            }
          });
        }
      },

      // Check arrow function parameters
      ArrowFunctionExpression(node) {
        if (node.params) {
          node.params.forEach((param) => {
            if (
              param.typeAnnotation &&
              isStringLiteralUnionType(param.typeAnnotation.typeAnnotation)
            ) {
              const typeName = getUnionTypeString(param.typeAnnotation.typeAnnotation);
              context.report({
                node: param,
                messageId: 'useConstEnum',
                data: { type: typeName }
              });
            }
          });
        }
      },

      // Check variable declarations with type annotations
      VariableDeclarator(node) {
        if (node.id && node.id.typeAnnotation) {
          // For simple identifiers
          if (node.id.typeAnnotation.typeAnnotation) {
            const typeNode = node.id.typeAnnotation.typeAnnotation;
            if (isStringLiteralUnionType(typeNode)) {
              const typeName = getUnionTypeString(typeNode);
              context.report({
                node: node.id,
                messageId: 'useConstEnum',
                data: { type: typeName }
              });
            }
          }
        }
      }
    };
  }
};
