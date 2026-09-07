import { describe, expect, it } from 'vitest';
import { createAuth, validateCredentials } from './auth';
import { createMemoryDriver } from './storage.test-drivers';

describe('validateCredentials (pure)', () => {
  it('rejects an invalid email format', () => {
    expect(validateCredentials('not-an-email', 'secret')).toEqual({
      ok: false,
      reason: 'invalid_email'
    });
  });

  it('rejects an empty password', () => {
    expect(validateCredentials('a@b.co', '')).toEqual({ ok: false, reason: 'empty_password' });
  });

  it('accepts a valid email and non-empty password', () => {
    expect(validateCredentials('a@b.co', 'secret')).toEqual({ ok: true });
  });

  it('rejects empty email as invalid', () => {
    expect(validateCredentials('', 'x').ok).toBe(false);
  });
});

describe('createAuth', () => {
  it('login returns a fake session and persists it', async () => {
    const driver = createMemoryDriver();
    const auth = createAuth(driver);
    const session = await auth.login('user@example.com', 'pw');
    expect(session.email).toBe('user@example.com');
    expect(session.token).toBeTruthy();
    const restored = await createAuth(driver).getSession();
    expect(restored?.email).toBe('user@example.com');
  });

  it('login rejects invalid credentials', async () => {
    const auth = createAuth(createMemoryDriver());
    await expect(auth.login('bad', '')).rejects.toThrow('invalid_email');
  });

  it('logout clears the persisted session', async () => {
    const auth = createAuth(createMemoryDriver());
    await auth.login('user@example.com', 'pw');
    await auth.logout();
    await expect(auth.getSession()).resolves.toBeNull();
  });

  it('getSession returns null when no session exists', async () => {
    const auth = createAuth(createMemoryDriver());
    await expect(auth.getSession()).resolves.toBeNull();
  });
});
