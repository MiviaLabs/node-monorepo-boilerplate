/**
 * Unit Tests for VersionService
 *
 * Tests the version service with mocked ConfigService.
 */

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { ApiVersionStatus } from '../../../config/version.config';
import { VersionService } from '../version.service';

import type { TestingModule } from '@nestjs/testing';

describe('VersionService', () => {
  let service: VersionService;

  const mockConfig = {
    enabled: true,
    versions: [
      { prefix: 'v1', version: '1.0.0', status: ApiVersionStatus.ACTIVE },
      {
        prefix: 'v2',
        version: '2.0.0',
        status: ApiVersionStatus.DEPRECATED,
        sunsetDate: '2026-12-31'
      },
      { prefix: 'v3', version: '3.0.0', status: ApiVersionStatus.SUNSET }
    ],
    defaultVersion: 'v1',
    deprecationWarningDays: 90
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockConfig)
          }
        }
      ]
    }).compile();

    service = module.get<VersionService>(VersionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default config when version config is missing', async () => {
      // Arrange
      const testModule: TestingModule = await Test.createTestingModule({
        providers: [
          VersionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined)
            }
          }
        ]
      }).compile();

      const testService = testModule.get<VersionService>(VersionService);

      // Act
      const allVersions = testService.getAllVersions();

      // Assert
      expect(allVersions).toHaveLength(1);
      expect(allVersions[0]?.prefix).toBe('v1');
      expect(allVersions[0]?.status).toBe(ApiVersionStatus.ACTIVE);
    });

    it('should use provided config when available', () => {
      // Assert - service is created in beforeEach with mockConfig
      const allVersions = service.getAllVersions();

      expect(allVersions).toHaveLength(3);
      expect(allVersions[0]?.prefix).toBe('v1');
      expect(allVersions[1]?.prefix).toBe('v2');
      expect(allVersions[2]?.prefix).toBe('v3');
    });
  });

  describe('getVersion', () => {
    it('should return version info for existing prefix', () => {
      // Act
      const result = service.getVersion('v2');

      // Assert
      expect(result).toBeDefined();
      expect(result?.prefix).toBe('v2');
      expect(result?.version).toBe('2.0.0');
    });

    it('should return undefined for non-existent prefix', () => {
      // Act
      const result = service.getVersion('v999');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('getAllVersions', () => {
    it('should return copy of versions array', () => {
      // Act
      const result = service.getAllVersions();

      // Assert
      expect(result).toHaveLength(3);
      expect(result).not.toBe(mockConfig.versions); // Should be a copy
    });
  });

  describe('getActiveVersions', () => {
    it('should exclude sunset versions', () => {
      // Act
      const result = service.getActiveVersions();

      // Assert
      expect(result).toHaveLength(2); // v1 and v2, not v3
      expect(result.every((v) => v.status !== ApiVersionStatus.SUNSET)).toBe(true);
    });
  });

  describe('getCurrentVersions', () => {
    it('should return only active versions', () => {
      // Act
      const result = service.getCurrentVersions();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.prefix).toBe('v1');
      expect(result[0]?.status).toBe(ApiVersionStatus.ACTIVE);
    });
  });

  describe('getDeprecatedVersions', () => {
    it('should return only deprecated versions', () => {
      // Act
      const result = service.getDeprecatedVersions();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.prefix).toBe('v2');
      expect(result[0]?.status).toBe(ApiVersionStatus.DEPRECATED);
    });
  });

  describe('isVersionSupported', () => {
    it('should return true for active versions', () => {
      // Act
      const result = service.isVersionSupported('v1');

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for deprecated versions', () => {
      // Act
      const result = service.isVersionSupported('v2');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for sunset versions', () => {
      // Act
      const result = service.isVersionSupported('v3');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('isVersionDeprecated', () => {
    it('should return true for deprecated version', () => {
      // Act
      const result = service.isVersionDeprecated('v2');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for active version', () => {
      // Act
      const result = service.isVersionDeprecated('v1');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getDefaultVersion', () => {
    it('should return default version from config', () => {
      // Act
      const result = service.getDefaultVersion();

      // Assert
      expect(result).toBe('v1');
    });
  });

  describe('getDeprecationInfo', () => {
    it('should return deprecation info for deprecated version', () => {
      // Act
      const result = service.getDeprecationInfo('v2');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.deprecated).toBe(true);
      expect(result?.sunsetDate).toBe('2026-12-31');
      expect(result?.daysUntilSunset).toBeGreaterThan(0);
    });

    it('should return null for active version', () => {
      // Act
      const result = service.getDeprecationInfo('v1');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getDaysUntilSunset', () => {
    it('should return days until sunset', () => {
      // Act
      const result = service.getDaysUntilSunset('v2');

      // Assert
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThan(0);
    });

    it('should return null for non-deprecated version', () => {
      // Act
      const result = service.getDaysUntilSunset('v1');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('isVersionSunset', () => {
    it('should return true for sunset status version', () => {
      // Act
      const result = service.isVersionSunset('v3');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for active version', () => {
      // Act
      const result = service.isVersionSunset('v1');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getSemanticVersion', () => {
    it('should return semantic version string', () => {
      // Act
      const result = service.getSemanticVersion();

      // Assert
      expect(result).toBe('1.0.0');
    });
  });

  describe('getFullVersionInfo', () => {
    it('should return full version info with git metadata', () => {
      // Arrange
      process.env['GIT_COMMIT'] = 'abc123def456';
      process.env['GIT_SHORT_COMMIT'] = 'abc123';

      // Act
      const result = service.getFullVersionInfo();

      // Assert
      expect(result.version).toBe('1.0.0');
      expect(result.gitCommit).toBe('abc123def456');
      expect(result.gitShortCommit).toBe('abc123');
      expect(result.buildDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Cleanup
      delete process.env['GIT_COMMIT'];
      delete process.env['GIT_SHORT_COMMIT'];
    });

    it('should return unknown for git metadata when env vars not set', () => {
      // Arrange
      delete process.env['GIT_COMMIT'];
      delete process.env['GIT_SHORT_COMMIT'];

      // Act
      const result = service.getFullVersionInfo();

      // Assert
      expect(result.gitCommit).toBe('unknown');
      expect(result.gitShortCommit).toBe('unknown');
    });
  });
});
