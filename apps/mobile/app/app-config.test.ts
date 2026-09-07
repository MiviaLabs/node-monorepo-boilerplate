import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getAppName, getSlug } from './app-config';

const appJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../app.json'), 'utf8')
) as { name: string; slug: string };

describe('app config', () => {
  it('parses app.json and matches the helpers', () => {
    expect(appJson.name).toBe('Mobile');
    expect(getAppName(appJson)).toBe('Mobile');
    expect(getSlug(appJson)).toBe('mobile');
  });

  it('exposes hello-world text constant', () => {
    expect(getAppName({ name: 'Hello World' })).toBe('Hello World');
  });
});
