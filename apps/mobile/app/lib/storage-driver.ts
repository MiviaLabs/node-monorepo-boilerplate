import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageDriver } from './storage';

/** Driver backed by AsyncStorage (SDK 54-pinned 2.2.x). App-only; not used in tests. */
export const asyncStorageDriver: StorageDriver = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key)
};
