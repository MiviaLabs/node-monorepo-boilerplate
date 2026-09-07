/**
 * Global type declarations for Jest tests
 *
 * @packageDocumentation
 */

declare global {
  // eslint-disable-next-line no-var
  var __E2E_TEST_CLEANUP__: (() => Promise<void>) | undefined;
}

export {};
