import { Test } from '@nestjs/testing';

import { AppService } from '../app.service';

import type { TestingModule } from '@nestjs/testing';

import { TranslationHelperService } from '@/common/i18n/translation-helper.service';

describe('AppService', () => {
  let appService: AppService;
  let translationHelper: TranslationHelperService;

  beforeEach(async () => {
    const mockTranslationHelperService = {
      translate: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: TranslationHelperService,
          useValue: mockTranslationHelperService
        }
      ]
    }).compile();

    appService = module.get<AppService>(AppService);
    translationHelper = module.get<TranslationHelperService>(TranslationHelperService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return status object with "ok" status and translated welcome message', () => {
      // Arrange
      const translatedMessage = 'Bienvenue sur notre plateforme!';
      jest.spyOn(translationHelper, 'translate').mockReturnValue(translatedMessage);

      // Act
      const result = appService.getStatus();

      // Assert
      expect(result).toEqual({
        status: 'ok',
        message: translatedMessage
      });
    });

    it('should call translation helper with "api.info.welcome" key', () => {
      // Arrange
      const translateSpy = jest.spyOn(translationHelper, 'translate').mockReturnValue('Welcome!');

      // Act
      appService.getStatus();

      // Assert
      expect(translateSpy).toHaveBeenCalledWith('api.info.welcome');
      expect(translateSpy).toHaveBeenCalledTimes(1);
    });

    it('should return English translation when locale is en', () => {
      // Arrange
      const englishMessage = 'Welcome to our platform!';
      jest.spyOn(translationHelper, 'translate').mockReturnValue(englishMessage);

      // Act
      const result = appService.getStatus();

      // Assert
      expect(result.message).toBe(englishMessage);
    });

    it('should return Arabic translation when locale is ar-SA', () => {
      // Arrange
      const arabicMessage = 'مرحباً بك في منصتنا!';
      jest.spyOn(translationHelper, 'translate').mockReturnValue(arabicMessage);

      // Act
      const result = appService.getStatus();

      // Assert
      expect(result.message).toBe(arabicMessage);
    });

    it('should return Filipino translation when locale is tl-PH', () => {
      // Arrange
      const filipinoMessage = 'Maligayang pagdating sa aming platform!';
      jest.spyOn(translationHelper, 'translate').mockReturnValue(filipinoMessage);

      // Act
      const result = appService.getStatus();

      // Assert
      expect(result.message).toBe(filipinoMessage);
    });

    it('should return French translation when locale is fr', () => {
      // Arrange
      const frenchMessage = 'Bienvenue sur notre plateforme!';
      jest.spyOn(translationHelper, 'translate').mockReturnValue(frenchMessage);

      // Act
      const result = appService.getStatus();

      // Assert
      expect(result.message).toBe(frenchMessage);
    });

    it('should always return "ok" status regardless of translation', () => {
      // Arrange
      jest.spyOn(translationHelper, 'translate').mockReturnValue('Any translation');

      // Act
      const result = appService.getStatus();

      // Assert
      expect(result.status).toBe('ok');
    });
  });
});
