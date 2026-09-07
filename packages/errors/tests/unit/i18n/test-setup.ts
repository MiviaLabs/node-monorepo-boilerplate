/**
 * Test setup for i18n tests
 *
 * Initializes the TranslationService before tests run.
 * This file should be imported before running i18n tests.
 */

import { TranslationService } from '../../../src/i18n/translation.service';

let initialized = false;

export async function setupI18nTests() {
  if (!initialized) {
    await TranslationService.initialize();
    initialized = true;
  }
}

// Auto-initialize on import (top-level await is supported in ES modules)
await setupI18nTests();
