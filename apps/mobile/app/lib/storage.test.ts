import { describe, expect, it } from 'vitest';
import { createMemoryDriver } from './storage.test-drivers';
import { createStorage } from './storage';

describe('createStorage', () => {
  it('set then get round-trips JSON values', async () => {
    const storage = createStorage(createMemoryDriver());
    await storage.set('k', { a: 1, b: 'x' });
    await expect(storage.get<{ a: number; b: string }>('k')).resolves.toEqual({ a: 1, b: 'x' });
  });

  it('returns null for missing keys', async () => {
    const storage = createStorage(createMemoryDriver());
    await expect(storage.get('missing')).resolves.toBeNull();
  });

  it('get parses stored JSON with the given type', async () => {
    const storage = createStorage(createMemoryDriver());
    interface Session {
      email: string;
    }
    await storage.set<Session>('session', { email: 'a@b.co' });
    await expect(storage.get<Session>('session')).resolves.toEqual({ email: 'a@b.co' });
  });

  it('remove deletes the key', async () => {
    const storage = createStorage(createMemoryDriver());
    await storage.set('k', 42);
    await storage.remove('k');
    await expect(storage.get('k')).resolves.toBeNull();
  });

  it('get returns null for corrupted JSON instead of throwing', async () => {
    const driver = createMemoryDriver();
    await driver.setItem('bad', '{not-json');
    const storage = createStorage(driver);
    await expect(storage.get('bad')).resolves.toBeNull();
  });
});
