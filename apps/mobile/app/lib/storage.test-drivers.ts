import type { StorageDriver } from './storage';

/** In-memory driver for Node tests. Never imports AsyncStorage. */
export function createMemoryDriver(): StorageDriver {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    }
  };
}
