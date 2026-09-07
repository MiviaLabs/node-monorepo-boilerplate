import { describe, expect, it } from '@jest/globals';

import { CONTENT_SLUG_MAX_LENGTH, normalizeContentSlug, slugFromTitle } from '../content-slug.util';

describe('content slug utils', () => {
  it('normalizes mixed case and spacing into a kebab-case slug', () => {
    expect(normalizeContentSlug('  Hello   World  ')).toBe('hello-world');
  });

  it('removes punctuation and collapses separators', () => {
    expect(normalizeContentSlug('API: Overview / Intro!!!')).toBe('api-overview-intro');
  });

  it('trims leading and trailing separators', () => {
    expect(normalizeContentSlug('---roadmap---')).toBe('roadmap');
  });

  it('truncates slugs to the configured max length', () => {
    const source = 'a'.repeat(CONTENT_SLUG_MAX_LENGTH + 20);

    expect(normalizeContentSlug(source)).toHaveLength(CONTENT_SLUG_MAX_LENGTH);
  });

  it('throws when normalization would produce an empty slug', () => {
    expect(() => normalizeContentSlug('!!!')).toThrow(/slug/i);
  });

  it('derives a slug from title text', () => {
    expect(slugFromTitle('Project Setup Guide')).toBe('project-setup-guide');
  });
});
