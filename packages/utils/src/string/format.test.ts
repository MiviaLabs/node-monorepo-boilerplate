/**
 * Tests for string/format.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { capitalize, camelCase, snakeCase, kebabCase, pascalCase } from './format.js';

describe('string/format', () => {
  describe('capitalize', () => {
    it('should capitalize the first letter of a string', () => {
      assert.strictEqual(capitalize('hello'), 'Hello');
      assert.strictEqual(capitalize('HELLO'), 'HELLO');
      assert.strictEqual(capitalize('hELLO'), 'HELLO');
    });

    it('should handle empty string', () => {
      assert.strictEqual(capitalize(''), '');
    });

    it('should handle single character', () => {
      assert.strictEqual(capitalize('a'), 'A');
      assert.strictEqual(capitalize('A'), 'A');
    });

    it('should handle strings starting with non-letters', () => {
      assert.strictEqual(capitalize('123abc'), '123abc');
      assert.strictEqual(capitalize(' hello'), ' hello');
    });
  });

  describe('camelCase', () => {
    it('should convert string to camelCase', () => {
      assert.strictEqual(camelCase('hello world'), 'helloWorld');
      assert.strictEqual(camelCase('Hello World'), 'helloWorld');
      assert.strictEqual(camelCase('hello-world'), 'helloWorld');
      assert.strictEqual(camelCase('hello_world'), 'helloWorld');
    });

    it('should handle multiple spaces and separators', () => {
      assert.strictEqual(camelCase('hello  world'), 'helloWorld');
      assert.strictEqual(camelCase('hello--world'), 'helloWorld');
      assert.strictEqual(camelCase('hello__world'), 'helloWorld');
    });

    it('should handle empty string', () => {
      assert.strictEqual(camelCase(''), '');
    });

    it('should handle single word', () => {
      assert.strictEqual(camelCase('hello'), 'hello');
      assert.strictEqual(camelCase('Hello'), 'hello');
    });

    it('should handle leading/trailing separators', () => {
      assert.strictEqual(camelCase('-hello'), 'hello');
      assert.strictEqual(camelCase('_hello'), 'hello');
      assert.strictEqual(camelCase(' hello'), 'hello');
    });
  });

  describe('snakeCase', () => {
    it('should convert string to snake_case', () => {
      assert.strictEqual(snakeCase('hello world'), 'hello_world');
      assert.strictEqual(snakeCase('helloWorld'), 'hello_world');
      assert.strictEqual(snakeCase('hello-world'), 'hello_world');
      assert.strictEqual(snakeCase('HelloWorld'), 'hello_world');
    });

    it('should handle multiple spaces and separators', () => {
      assert.strictEqual(snakeCase('hello  world'), 'hello_world');
      assert.strictEqual(snakeCase('hello--world'), 'hello_world');
    });

    it('should handle empty string', () => {
      assert.strictEqual(snakeCase(''), '');
    });

    it('should handle single word', () => {
      assert.strictEqual(snakeCase('hello'), 'hello');
      assert.strictEqual(snakeCase('Hello'), 'hello');
    });

    it('should handle leading/trailing separators', () => {
      assert.strictEqual(snakeCase('-hello'), 'hello');
      assert.strictEqual(snakeCase('_hello'), 'hello');
    });
  });

  describe('kebabCase', () => {
    it('should convert string to kebab-case', () => {
      assert.strictEqual(kebabCase('hello world'), 'hello-world');
      assert.strictEqual(kebabCase('helloWorld'), 'hello-world');
      assert.strictEqual(kebabCase('hello_world'), 'hello-world');
      assert.strictEqual(kebabCase('HelloWorld'), 'hello-world');
    });

    it('should handle multiple spaces and separators', () => {
      assert.strictEqual(kebabCase('hello  world'), 'hello-world');
      assert.strictEqual(kebabCase('hello__world'), 'hello-world');
    });

    it('should handle empty string', () => {
      assert.strictEqual(kebabCase(''), '');
    });

    it('should handle single word', () => {
      assert.strictEqual(kebabCase('hello'), 'hello');
      assert.strictEqual(kebabCase('Hello'), 'hello');
    });

    it('should handle leading/trailing separators', () => {
      assert.strictEqual(kebabCase('-hello'), 'hello');
      assert.strictEqual(kebabCase('_hello'), 'hello');
    });
  });

  describe('pascalCase', () => {
    it('should convert string to PascalCase', () => {
      assert.strictEqual(pascalCase('hello world'), 'HelloWorld');
      assert.strictEqual(pascalCase('hello-world'), 'HelloWorld');
      assert.strictEqual(pascalCase('hello_world'), 'HelloWorld');
      assert.strictEqual(pascalCase('helloWorld'), 'HelloWorld');
    });

    it('should handle multiple spaces and separators', () => {
      assert.strictEqual(pascalCase('hello  world'), 'HelloWorld');
    });

    it('should handle empty string', () => {
      assert.strictEqual(pascalCase(''), '');
    });

    it('should handle single word', () => {
      assert.strictEqual(pascalCase('hello'), 'Hello');
    });
  });
});
