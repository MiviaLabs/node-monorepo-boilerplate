import { STORAGE_KEYS, type AppStorage } from './storage';
import { createStorage } from './storage';

export interface Session {
  email: string;
  token: string;
  loggedInAt: string;
}

export const enum CredentialError {
  InvalidEmail = 'invalid_email',
  EmptyPassword = 'empty_password'
}

export type CredentialCheck = { ok: true } | { ok: false; reason: CredentialError };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure credential validation, no I/O. */
export function validateCredentials(email: string, password: string): CredentialCheck {
  if (!EMAIL_RE.test(email.trim())) {
    return { ok: false, reason: CredentialError.InvalidEmail };
  }
  if (password.length === 0) {
    return { ok: false, reason: CredentialError.EmptyPassword };
  }
  return { ok: true };
}

export interface Auth {
  login(email: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  getSession(): Promise<Session | null>;
}

export function createAuth(driver: Parameters<typeof createStorage>[0]): Auth {
  const storage: AppStorage = createStorage(driver);
  return {
    async login(email: string, password: string): Promise<Session> {
      const check = validateCredentials(email, password);
      if (!check.ok) {
        throw new Error(check.reason);
      }
      const session: Session = {
        email: email.trim(),
        token: `mock-token-${Date.now().toString(36)}`,
        loggedInAt: new Date().toISOString()
      };
      await storage.set(STORAGE_KEYS.session, session);
      return session;
    },
    async logout(): Promise<void> {
      await storage.remove(STORAGE_KEYS.session);
    },
    async getSession(): Promise<Session | null> {
      return storage.get<Session>(STORAGE_KEYS.session);
    }
  };
}
