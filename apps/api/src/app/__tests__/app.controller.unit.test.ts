import { Test } from '@nestjs/testing';

import { AppController } from '../app.controller';
import { AppService } from '../app.service';

import type { TestingModule } from '@nestjs/testing';

import { TranslationHelperService } from '@/common/i18n/translation-helper.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const mockTranslationHelperService = {
      translate: jest.fn().mockReturnValue('Welcome to our platform!')
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getStatus: jest.fn().mockReturnValue({
              status: 'ok',
              message: 'Welcome to our platform!'
            })
          }
        },
        {
          provide: TranslationHelperService,
          useValue: mockTranslationHelperService
        }
      ]
    }).compile();

    appController = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return status object from service', () => {
      // Arrange
      const expectedResponse = {
        status: 'ok',
        message: 'Welcome to our platform!'
      };
      jest.spyOn(appService, 'getStatus').mockReturnValue(expectedResponse);

      // Act
      const result = appController.getStatus();

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(appService.getStatus).toHaveBeenCalledTimes(1);
    });

    it('should delegate to AppService', () => {
      // Arrange
      const statusSpy = jest.spyOn(appService, 'getStatus');

      // Act
      appController.getStatus();

      // Assert
      expect(statusSpy).toHaveBeenCalled();
    });
  });
});
