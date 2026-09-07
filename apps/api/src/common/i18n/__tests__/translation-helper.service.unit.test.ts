/**
 * Unit Tests for TranslationHelperService
 *
 * Tests the translation helper service with mocked dependencies.
 */

import { Test } from '@nestjs/testing';
import { TranslationService } from '@package/errors';

import { REQUEST_LOCALE, TRANSLATION_SERVICE } from '../i18n.constants';
import { TranslationHelperService } from '../translation-helper.service';

import type { TestingModule } from '@nestjs/testing';

describe('TranslationHelperService', () => {
  let module: TestingModule;
  let translationService: typeof TranslationService;

  beforeAll(async () => {
    // Initialize TranslationService once for all tests
    await TranslationService.initialize();
    // Also load available locales to populate cachedLocales
    await TranslationService.getAvailableLocales();
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        TranslationHelperService,
        {
          provide: TRANSLATION_SERVICE,
          useValue: TranslationService
        },
        {
          provide: REQUEST_LOCALE,
          useValue: 'en'
        }
      ]
    }).compile();

    translationService = module.get<typeof TranslationService>(TRANSLATION_SERVICE);
  });

  // Helper function to get service instance
  const getService = async (): Promise<TranslationHelperService> => {
    return await module.resolve<TranslationHelperService>(TranslationHelperService);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('translate', () => {
    it('should translate message with current locale', async () => {
      // Arrange
      const service = await getService();
      const code = 'AUTH_001'; // "Invalid email or password"

      // Act
      const result = service.translate(code);

      // Assert
      expect(result).toBe('Invalid email or password');
    });

    it('should translate message with parameters', async () => {
      // Arrange
      const service = await getService();
      const code = 'USER_001';
      const parameters = { userId: '123' };

      // Act
      const result = service.translate(code, parameters);

      // Assert
      expect(result).toContain('123');
      expect(result).toContain('not found');
    });

    it('should call TranslationService.translate with locale option', async () => {
      // Arrange
      const service = await getService();
      const translateSpy = jest.spyOn(translationService, 'translate');
      const code = 'AUTH_001';

      // Act
      service.translate(code);

      // Assert
      expect(translateSpy).toHaveBeenCalledWith('AUTH_001', undefined, { locale: 'en' });
    });
  });

  describe('translateWithResult', () => {
    it('should return full translation result with metadata', async () => {
      // Arrange
      const service = await getService();
      const code = 'AUTH_001'; // "Invalid email or password"

      // Act
      const result = service.translateWithResult(code);

      // Assert
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('locale');
      expect(result).toHaveProperty('usedFallback');
      expect(result).toHaveProperty('code');
      expect(result.message).toBe('Invalid email or password');
      expect(result.locale).toBe('en');
      expect(result.usedFallback).toBe(false);
    });

    it('should include parameters in result', async () => {
      // Arrange
      const service = await getService();
      const code = 'USER_001';
      const parameters = { userId: '456' };

      // Act
      const result = service.translateWithResult(code, parameters);

      // Assert
      expect(result.message).toContain('456');
    });
  });

  describe('translateAsync', () => {
    it('should translate message asynchronously', async () => {
      // Arrange
      const service = await getService();
      const code = 'AUTH_001'; // "Invalid email or password"

      // Act
      const result = await service.translateAsync(code);

      // Assert
      expect(result).toBe('Invalid email or password');
    });

    it('should handle parameters in async translation', async () => {
      // Arrange
      const service = await getService();
      const code = 'VAL_001';
      const parameters = { field: 'email' };

      // Act
      const result = await service.translateAsync(code, parameters);

      // Assert
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('getLocale', () => {
    it('should return current locale', async () => {
      // Arrange
      const service = await getService();

      // Act
      const locale = service.getLocale();

      // Assert
      expect(locale).toBe('en');
    });

    it('should return locale from constructor', async () => {
      // Arrange - create service with different locale
      const testModule: TestingModule = await Test.createTestingModule({
        providers: [
          TranslationHelperService,
          {
            provide: TRANSLATION_SERVICE,
            useValue: TranslationService
          },
          {
            provide: REQUEST_LOCALE,
            useValue: 'ar-SA'
          }
        ]
      }).compile();

      const arabicService =
        await testModule.resolve<TranslationHelperService>(TranslationHelperService);

      // Act
      const locale = arabicService.getLocale();

      // Assert
      expect(locale).toBe('ar-SA');
    });
  });

  describe('hasTranslation', () => {
    it('should return true for existing translation key', async () => {
      // Arrange
      const service = await getService();
      const code = 'USER_001';

      // Act
      const result = service.hasTranslation(code);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existent translation key', async () => {
      // Arrange
      const service = await getService();
      const code = 'nonexistent.key';

      // Act
      const result = service.hasTranslation(code);

      // Assert
      expect(result).toBe(false);
    });

    it('should call TranslationService.getTranslation', async () => {
      // Arrange
      const service = await getService();
      const getTranslationSpy = jest.spyOn(translationService, 'getTranslation');
      const code = 'USER_001';

      // Act
      service.hasTranslation(code);

      // Assert
      expect(getTranslationSpy).toHaveBeenCalledWith(code, 'en');
    });
  });

  describe('locale-specific translations', () => {
    it('should translate to Arabic for ar-SA locale', async () => {
      // Arrange
      const testModule: TestingModule = await Test.createTestingModule({
        providers: [
          TranslationHelperService,
          {
            provide: TRANSLATION_SERVICE,
            useValue: TranslationService
          },
          {
            provide: REQUEST_LOCALE,
            useValue: 'ar-SA'
          }
        ]
      }).compile();

      const arabicService =
        await testModule.resolve<TranslationHelperService>(TranslationHelperService);

      // Act
      const result = arabicService.translate('AUTH_001');

      // Assert
      expect(result).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    });
  });
});
