/**
 * HealthService Unit Tests
 *
 * Tests the HealthService business logic.
 * Mocks VersionService, TranslationHelperService, and health indicators.
 */

import { Test } from '@nestjs/testing';

import { HealthResponseDto } from '../../dto/health-response.dto';
import { IndicatorStatus } from '../../health.constants';
import { DatabaseHealthIndicator } from '../../indicators/database-health-indicator';
import { EncryptionHealthIndicator } from '../../indicators/encryption-health-indicator';
import { OutboxHealthIndicator } from '../../indicators/outbox-health-indicator';
import { RedisHealthIndicator } from '../../indicators/redis-health-indicator';
import { HealthService } from '../../services/health.service';

import type { TestingModule } from '@nestjs/testing';

import { TranslationHelperService } from '@/common/i18n/translation-helper.service';
import { VersionService } from '@/common/services/version.service';

describe('HealthService', () => {
  let service: HealthService;
  let versionService: jest.Mocked<VersionService>;
  let translator: jest.Mocked<TranslationHelperService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: VersionService,
          useValue: {
            getSemanticVersion: jest.fn().mockReturnValue('1.0.0')
          }
        },
        {
          provide: TranslationHelperService,
          useValue: {
            translate: jest.fn().mockReturnValue('API is healthy')
          }
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: {
            check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
            constructor: { name: 'DatabaseHealthIndicator' }
          }
        },
        {
          provide: EncryptionHealthIndicator,
          useValue: {
            check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
            constructor: { name: 'EncryptionHealthIndicator' }
          }
        },
        {
          provide: OutboxHealthIndicator,
          useValue: {
            check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
            constructor: { name: 'OutboxHealthIndicator' }
          }
        },
        {
          provide: RedisHealthIndicator,
          useValue: {
            check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
            constructor: { name: 'RedisHealthIndicator' }
          }
        }
      ]
    }).compile();

    service = module.get<HealthService>(HealthService);
    // Cast to any to bypass jest.Mocked type issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    versionService = module.get<VersionService>(VersionService) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    translator = module.get<TranslationHelperService>(TranslationHelperService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return healthy status when all indicators are up', async () => {
      // Act
      const result = await service.getHealth();

      // Assert
      expect(result).toBeInstanceOf(HealthResponseDto);
      expect(result.data.status).toBe('ok');
      expect(result.data.version).toBe('1.0.0');
      expect(result.data.details).toEqual({
        database: { status: 'up' },
        encryption: { status: 'up' },
        outbox: { status: 'up' },
        redis: { status: 'up' }
      });
      expect(translator.translate).toHaveBeenCalledWith('api.health.healthy');
    });

    it('should return unhealthy status when an indicator is down', async () => {
      // Arrange - Override the DatabaseHealthIndicator mock to return down status
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HealthService,
          {
            provide: VersionService,
            useValue: {
              getSemanticVersion: jest.fn().mockReturnValue('1.0.0')
            }
          },
          {
            provide: TranslationHelperService,
            useValue: {
              translate: jest.fn().mockReturnValue('API is degraded')
            }
          },
          {
            provide: DatabaseHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({
                status: IndicatorStatus.Down,
                message: 'Connection failed'
              }),
              constructor: { name: 'DatabaseHealthIndicator' }
            }
          },
          {
            provide: EncryptionHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'EncryptionHealthIndicator' }
            }
          },
          {
            provide: OutboxHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'OutboxHealthIndicator' }
            }
          },
          {
            provide: RedisHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'RedisHealthIndicator' }
            }
          }
        ]
      }).compile();

      service = module.get<HealthService>(HealthService);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translator = module.get<TranslationHelperService>(TranslationHelperService) as any;

      // Act
      const result = await service.getHealth();

      // Assert
      expect(result.data.status).toBe('error');
      expect(result.data.details).toEqual({
        database: { status: 'down', message: 'Connection failed' },
        encryption: { status: 'up' },
        outbox: { status: 'up' },
        redis: { status: 'up' }
      });
      expect(translator.translate).toHaveBeenCalledWith('api.health.degraded');
    });

    it('should handle indicator throwing errors gracefully', async () => {
      // Arrange - Override the DatabaseHealthIndicator mock to throw error
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HealthService,
          {
            provide: VersionService,
            useValue: {
              getSemanticVersion: jest.fn().mockReturnValue('1.0.0')
            }
          },
          {
            provide: TranslationHelperService,
            useValue: {
              translate: jest.fn().mockReturnValue('API is degraded')
            }
          },
          {
            provide: DatabaseHealthIndicator,
            useValue: {
              check: jest.fn().mockRejectedValue(new Error('Indicator failed')),
              constructor: { name: 'DatabaseHealthIndicator' }
            }
          },
          {
            provide: EncryptionHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'EncryptionHealthIndicator' }
            }
          },
          {
            provide: OutboxHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'OutboxHealthIndicator' }
            }
          },
          {
            provide: RedisHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'RedisHealthIndicator' }
            }
          }
        ]
      }).compile();

      service = module.get<HealthService>(HealthService);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translator = module.get<TranslationHelperService>(TranslationHelperService) as any;

      // Act
      const result = await service.getHealth();

      // Assert
      expect(result.data.status).toBe('error');
      expect(result.data.details).toEqual({
        database: { status: 'down', message: 'Indicator failed' },
        encryption: { status: 'up' },
        outbox: { status: 'up' },
        redis: { status: 'up' }
      });
    });

    it('should include version from VersionService', async () => {
      // Arrange
      versionService.getSemanticVersion.mockReturnValue('2.5.0');

      // Act
      const result = await service.getHealth();

      // Assert
      expect(result.data.version).toBe('2.5.0');
      expect(versionService.getSemanticVersion).toHaveBeenCalled();
    });

    it('should translate health message', async () => {
      // Arrange
      translator.translate.mockReturnValue('التعليمات البرمجية للمواجهة تعمل بشكل صحيح');

      // Act
      const result = await service.getHealth();

      // Assert
      expect(result.data.message).toBe('التعليمات البرمجية للمواجهة تعمل بشكل صحيح');
      expect(translator.translate).toHaveBeenCalledWith('api.health.healthy');
    });

    it('should include timestamp in response', async () => {
      // Act
      const before = new Date();
      const result = await service.getHealth();
      const after = new Date();

      // Assert
      expect(typeof result.data.timestamp).toBe('string');
      const timestamp = new Date(result.data.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('edge cases', () => {
    it('should handle empty details object', async () => {
      // Arrange - Create service with no indicators by mocking DatabaseHealthIndicator differently
      // We can't actually remove the indicator since it's injected in constructor,
      // but we can test the details object structure
      const result = await service.getHealth();

      // Assert
      expect(result.data.details).toBeDefined();
      expect(result.data.details && 'database' in result.data.details).toBe(true);
      expect(result.data.details && 'outbox' in result.data.details).toBe(true);
      expect(result.data.details && 'redis' in result.data.details).toBe(true);
    });

    it('should call VersionService exactly once', async () => {
      // Act
      await service.getHealth();

      // Assert
      expect(versionService.getSemanticVersion).toHaveBeenCalledTimes(1);
    });

    it('should call translator exactly once for healthy status', async () => {
      // Act
      await service.getHealth();

      // Assert
      expect(translator.translate).toHaveBeenCalledTimes(1);
      expect(translator.translate).toHaveBeenCalledWith('api.health.healthy');
    });

    it('should call translator for degraded status when indicator fails', async () => {
      // Arrange - Override the DatabaseHealthIndicator mock to return down status
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HealthService,
          {
            provide: VersionService,
            useValue: {
              getSemanticVersion: jest.fn().mockReturnValue('1.0.0')
            }
          },
          {
            provide: TranslationHelperService,
            useValue: {
              translate: jest.fn().mockReturnValue('API is degraded')
            }
          },
          {
            provide: DatabaseHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({
                status: IndicatorStatus.Down,
                message: 'Failed'
              }),
              constructor: { name: 'DatabaseHealthIndicator' }
            }
          },
          {
            provide: EncryptionHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'EncryptionHealthIndicator' }
            }
          },
          {
            provide: OutboxHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'OutboxHealthIndicator' }
            }
          },
          {
            provide: RedisHealthIndicator,
            useValue: {
              check: jest.fn().mockResolvedValue({ status: IndicatorStatus.Up }),
              constructor: { name: 'RedisHealthIndicator' }
            }
          }
        ]
      }).compile();

      service = module.get<HealthService>(HealthService);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translator = module.get<TranslationHelperService>(TranslationHelperService) as any;

      // Act
      await service.getHealth();

      // Assert
      expect(translator.translate).toHaveBeenCalledWith('api.health.degraded');
    });
  });
});
