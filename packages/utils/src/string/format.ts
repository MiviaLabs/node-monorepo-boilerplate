/**
 * String formatting utilities for case transformation
 */

/**
 * Capitalizes the first letter of a string while preserving the rest.
 *
 * @param str - The string to capitalize
 * @returns The string with its first character in uppercase, or the original
 *   string if empty
 *
 * @example
 * ```ts
 * capitalize('hello'); // 'Hello'
 * capitalize('hello world'); // 'Hello world'
 * capitalize(''); // ''
 * capitalize('HELLO'); // 'HELLO'
 * ```
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a string to camelCase format.
 *
 * Handles spaces, hyphens, and underscores as word separators. The first
 * word is lowercase, subsequent words have their first letter capitalized.
 *
 * @param str - The string to convert
 * @returns The string in camelCase format
 *
 * @example
 * ```ts
 * camelCase('hello world'); // 'helloWorld'
 * camelCase('hello-world'); // 'helloWorld'
 * camelCase('hello_world'); // 'helloWorld'
 * camelCase('HelloWorld'); // 'helloWorld'
 * camelCase(''); // ''
 * ```
 */
export function camelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase());
}

/**
 * Converts a string to snake_case format.
 *
 * Handles camelCase, spaces, and hyphens, converting them to underscores.
 * Leading separators are removed.
 *
 * @param str - The string to convert
 * @returns The string in snake_case format
 *
 * @example
 * ```ts
 * snakeCase('helloWorld'); // 'hello_world'
 * snakeCase('hello world'); // 'hello_world'
 * snakeCase('hello-world'); // 'hello_world'
 * snakeCase('HelloWorld'); // 'hello_world'
 * snakeCase(''); // ''
 * ```
 */
export function snakeCase(str: string): string {
  return str
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/^[-_\s]+/, '')
    .replace(/[\s-]+/g, '_');
}

/**
 * Converts a string to kebab-case format.
 *
 * Handles camelCase, spaces, and underscores, converting them to hyphens.
 * Leading separators are removed.
 *
 * @param str - The string to convert
 * @returns The string in kebab-case format
 *
 * @example
 * ```ts
 * kebabCase('helloWorld'); // 'hello-world'
 * kebabCase('hello world'); // 'hello-world'
 * kebabCase('hello_world'); // 'hello-world'
 * kebabCase('HelloWorld'); // 'hello-world'
 * kebabCase(''); // ''
 * ```
 */
export function kebabCase(str: string): string {
  return str
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    .replace(/^[-_\s]+/, '')
    .replace(/[\s_]+/g, '-');
}

/**
 * Converts a string to PascalCase format.
 *
 * Similar to camelCase but with the first letter also capitalized.
 * Internally uses camelCase then capitalizes the result.
 *
 * @param str - The string to convert
 * @returns The string in PascalCase format
 *
 * @example
 * ```ts
 * pascalCase('hello world'); // 'HelloWorld'
 * pascalCase('hello-world'); // 'HelloWorld'
 * pascalCase('hello_world'); // 'HelloWorld'
 * pascalCase('helloWorld'); // 'HelloWorld'
 * pascalCase(''); // ''
 * ```
 */
export function pascalCase(str: string): string {
  return capitalize(camelCase(str));
}
