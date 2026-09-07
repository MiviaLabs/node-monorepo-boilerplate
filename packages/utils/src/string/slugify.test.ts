/**
 * Tests for string/slugify.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { generateSlug, generateUniqueSlug, slugify } from './slugify.js';

describe('string/slugify', () => {
  describe('slugify', () => {
    it('should convert string to URL-friendly slug', () => {
      assert.strictEqual(slugify('Hello World'), 'hello-world');
      assert.strictEqual(slugify('Hello  World'), 'hello-world');
    });

    it('should convert to lowercase', () => {
      assert.strictEqual(slugify('HELLO WORLD'), 'hello-world');
      assert.strictEqual(slugify('HeLLo WoRLd'), 'hello-world');
    });

    it('should remove special characters', () => {
      assert.strictEqual(slugify('hello@world!'), 'hello-world');
      assert.strictEqual(slugify('hello$world%'), 'hello-world');
      assert.strictEqual(slugify('hello.world'), 'helloworld');
    });

    it('should handle underscores and hyphens', () => {
      assert.strictEqual(slugify('hello_world'), 'hello-world');
      assert.strictEqual(slugify('hello-world'), 'hello-world');
      assert.strictEqual(slugify('hello_-world'), 'hello-world');
    });

    it('should trim leading and trailing separators', () => {
      assert.strictEqual(slugify('-hello world-'), 'hello-world');
      assert.strictEqual(slugify('_hello world_'), 'hello-world');
      assert.strictEqual(slugify('---hello---'), 'hello');
    });

    it('should handle multiple consecutive separators', () => {
      assert.strictEqual(slugify('hello   world'), 'hello-world');
      assert.strictEqual(slugify('hello---world'), 'hello-world');
      assert.strictEqual(slugify('hello___world'), 'hello-world');
    });

    it('should handle empty string', () => {
      assert.strictEqual(slugify(''), '');
    });

    it('should handle strings with only special characters', () => {
      assert.strictEqual(slugify('@#$!'), '');
      assert.strictEqual(slugify('---'), '');
    });

    it('should preserve numbers', () => {
      assert.strictEqual(slugify('hello 123 world'), 'hello-123-world');
      assert.strictEqual(slugify('12345'), '12345');
    });

    it('should handle single word', () => {
      assert.strictEqual(slugify('hello'), 'hello');
      assert.strictEqual(slugify('HELLO'), 'hello');
    });
  });

  describe('generateUniqueSlug', () => {
    it('should return original slug if not in existing list', () => {
      const existing = ['foo', 'bar', 'baz'];
      assert.strictEqual(generateUniqueSlug('hello', existing), 'hello');
    });

    it('should append number if slug exists', () => {
      const existing = ['hello', 'foo', 'bar'];
      assert.strictEqual(generateUniqueSlug('hello', existing), 'hello-1');
    });

    it('should increment number until unique', () => {
      const existing = ['hello', 'hello-1', 'hello-2', 'foo'];
      assert.strictEqual(generateUniqueSlug('hello', existing), 'hello-3');
    });

    it('should handle empty existing list', () => {
      assert.strictEqual(generateUniqueSlug('hello', []), 'hello');
    });

    it('should handle multiple conflicts', () => {
      const existing = ['test', 'test-1', 'test-2', 'test-3', 'test-4'];
      assert.strictEqual(generateUniqueSlug('test', existing), 'test-5');
    });

    it('should not affect slugs that start with base but are not numbered', () => {
      const existing = ['hello-world', 'hello-foo', 'hello-bar'];
      assert.strictEqual(generateUniqueSlug('hello', existing), 'hello');
    });

    it('should find gap in numbered sequence', () => {
      const existing = ['hello', 'hello-2', 'hello-3'];
      assert.strictEqual(generateUniqueSlug('hello', existing), 'hello-1');
    });

    it('should handle readonly array', () => {
      const existing = ['hello', 'hello-1'];
      assert.strictEqual(generateUniqueSlug('hello', existing), 'hello-2');
    });
  });

  describe('generateSlug', () => {
    it('should slugify name and return if not in existing list', () => {
      const existing = ['foo', 'bar', 'baz'];
      assert.strictEqual(generateSlug('Hello World', existing), 'hello-world');
    });

    it('should slugify and append number if slug exists', () => {
      const existing = ['acme-corp', 'foo', 'bar'];
      assert.strictEqual(generateSlug('Acme Corp', existing), 'acme-corp-1');
    });

    it('should increment number until unique', () => {
      const existing = ['test-company', 'test-company-1', 'test-company-2'];
      assert.strictEqual(generateSlug('Test Company', existing), 'test-company-3');
    });

    it('should handle special characters in name', () => {
      const existing = ['foo', 'bar'];
      assert.strictEqual(generateSlug('Hello @ World!', existing), 'hello-world');
    });

    it('should handle empty existing list', () => {
      const existing: string[] = [];
      assert.strictEqual(generateSlug('My Company', existing), 'my-company');
    });

    it('should handle multiple conflicts', () => {
      const existing: string[] = ['start-up', 'start-up-1', 'start-up-2', 'start-up-3'];
      assert.strictEqual(generateSlug('Start-Up', existing), 'start-up-4');
    });

    it('should handle conflicts with numbered suffixes', () => {
      const existing: string[] = ['start-up-1', 'start-up-2', 'start-up-3'];
      assert.strictEqual(generateSlug('Start-Up', existing), 'start-up');
    });
  });
});
