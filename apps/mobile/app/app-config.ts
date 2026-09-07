/**
 * Pure helpers over the Expo app config. Kept free of any react-native
 * imports so the unit test target runs in plain Node without a JS runtime
 * shim for RN.
 */
export interface ExpoAppConfig {
  name?: string;
  slug?: string;
}

export function getAppName(config: ExpoAppConfig): string {
  return config.name ?? 'Mobile';
}

export function getSlug(config: ExpoAppConfig): string {
  return config.slug ?? 'mobile';
}
