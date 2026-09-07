/**
 * OpsHealthController Unit Tests
 *
 * Tests the OpsHealthController HTTP layer.
 * Mocks the HealthService to isolate controller logic.
 */

import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { OpsHealthController } from '../../controllers/health.controller';
import { HealthResponseDto } from '../../dto/health-response.dto';
import { HealthService } from '../../services/health.service';

import type { HealthData } from '../../dto/health-response.dto';
import type { TestingModule } from '@nestjs/testing';

describe('OpsHealthController', () => {
  let controller: OpsHealthController;
  let healthService: jest.Mocked<HealthService>;

  const mockHealthData: HealthData = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: 'ok' as any, // HealthStatus enum
    message: 'API is healthy',
    version: '1.0.0',
    timestamp: '2024-01-01T00:00:00.000Z',
    details: {}
  };

  const mockHealthResponse = HealthResponseDto.fromData(mockHealthData);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpsHealthController],
      imports: [
        JwtModule.register({
          secret: 'test-jwt-secret-key-with-32-chars-min',
          signOptions: { expiresIn: '1h' }
        })
      ],
      providers: [
        Reflector,
        JwtAuthGuard,
        {
          provide: HealthService,
          useValue: {
            getHealth: jest.fn()
          }
        }
      ]
    }).compile();

    controller = module.get<OpsHealthController>(OpsHealthController);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    healthService = module.get<HealthService>(HealthService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('health', () => {
    it('should return health status from service', async () => {
      // Arrange
      healthService.getHealth.mockResolvedValue(mockHealthResponse);

      // Act
      const result = await controller.health();

      // Assert
      expect(result).toEqual(mockHealthResponse);
      expect(result.data.status).toBe('ok');
      expect(result.data.version).toBe('1.0.0');
    });

    it('should call healthService.getHealth exactly once', async () => {
      // Arrange
      healthService.getHealth.mockResolvedValue(mockHealthResponse);

      // Act
      await controller.health();

      // Assert
      expect(healthService.getHealth).toHaveBeenCalledTimes(1);
    });

    it('should propagate service errors', async () => {
      // Arrange
      const error = new Error('Service unavailable');
      healthService.getHealth.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.health()).rejects.toThrow(error);
    });

    it('should return HealthResponseDto instance', async () => {
      // Arrange
      healthService.getHealth.mockResolvedValue(mockHealthResponse);

      // Act
      const result = await controller.health();

      // Assert
      expect(result).toBeInstanceOf(HealthResponseDto);
    });

    it('should include all required fields in response', async () => {
      // Arrange
      healthService.getHealth.mockResolvedValue(mockHealthResponse);

      // Act
      const result = await controller.health();

      // Assert
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('message');
      expect(result.data).toHaveProperty('version');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('details');
    });
  });
});
