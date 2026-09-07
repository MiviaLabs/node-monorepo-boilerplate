import { Injectable } from '@nestjs/common';

import { TranslationHelperService } from '@/common/i18n/translation-helper.service';

/**
 * Root application service
 * Provides application-level operations
 */
@Injectable()
export class AppService {
  constructor(private readonly translator: TranslationHelperService) {}

  /**
   * Get application status
   * Message is auto-translated based on Accept-Language header
   */
  getStatus(): { status: string; message: string } {
    return {
      status: 'ok',
      // Uses 'api.info.welcome' translation key
      // Returns different message based on locale:
      // - en: "Welcome to our platform!"
      // - ar-SA: "مرحباً بك في منصتنا!"
      // - tl-PH: "Maligayang pagdating sa aming platform!"
      // - fr: "Bienvenue sur notre plateforme!"
      message: this.translator.translate('api.info.welcome')
    };
  }
}
