/**
 * Typed JSON storage with a driver seam so logic is testable in plain Node.
 * The AsyncStorage-backed driver lives in `storage-driver.ts` and is never
 * imported by tests.
 */

export interface StorageDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const STORAGE_KEYS = {
  locale: 'app.locale',
  session: 'app.session'
} as const;

export interface AppStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createStorage(driver: StorageDriver): AppStorage {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await driver.getItem(key);
      if (raw === null) {
        return null;
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await driver.setItem(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      await driver.removeItem(key);
    }
  };
}
