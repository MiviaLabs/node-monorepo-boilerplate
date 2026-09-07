import { DEFAULT_FALLBACK_EMAIL } from '../constants';
import { EmailProviderType } from './interfaces';

import type { IEmailModuleConfig } from './interfaces';

/**
 * Default email module configuration.
 */
export const DEFAULT_EMAIL_CONFIG: Partial<IEmailModuleConfig> = {
  enableGracefulShutdown: true,
  enableTracing: true,
  provider: {
    type: EmailProviderType.MOCK,
    defaultFromEmail: DEFAULT_FALLBACK_EMAIL,
    defaultFromName: 'Example App',
    debug: false
  }
};
