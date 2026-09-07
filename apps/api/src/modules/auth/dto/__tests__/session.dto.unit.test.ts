/**
 * Unit Tests for SessionDto
 *
 * Tests SessionDto.fromEntity() mapping and field handling.
 */

import { SessionDto } from '../session.dto';

import type { SessionEntity } from '../session.dto';

describe('SessionDto', () => {
  describe('fromEntity', () => {
    const createMockSession = (overrides: Partial<SessionEntity> = {}): SessionEntity => ({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: 123,
      tenantId: 'tenant-abc-123',
      tokenId: '550e8400-e29b-41d4-a716-446655440001',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      expiresAt: new Date('2024-01-08T00:00:00.000Z'),
      lastActivity: new Date('2024-01-01T12:00:00.000Z'),
      active: true,
      ...overrides
    });

    it('should map all required fields correctly', () => {
      // Arrange
      const session = createMockSession();

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.id).toBe(session.id);
      expect(dto.userId).toBe(session.userId);
      expect(dto.tenantId).toBe(session.tenantId);
      expect(dto.tokenId).toBe(session.tokenId);
      expect(dto.createdAt).toEqual(session.createdAt);
      expect(dto.expiresAt).toEqual(session.expiresAt);
      expect(dto.lastActivity).toEqual(session.lastActivity);
      expect(dto.active).toBe(session.active);
    });

    it('should include ipAddress when present', () => {
      // Arrange
      const session = createMockSession({ ipAddress: '192.168.1.1' });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.ipAddress).toBe('192.168.1.1');
    });

    it('should include userAgent when present', () => {
      // Arrange
      const session = createMockSession({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0)');
    });

    it('should exclude ipAddress when undefined', () => {
      // Arrange
      const session = createMockSession({ ipAddress: undefined });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect('ipAddress' in dto).toBe(false);
    });

    it('should exclude userAgent when undefined', () => {
      // Arrange
      const session = createMockSession({ userAgent: undefined });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect('userAgent' in dto).toBe(false);
    });

    it('should include both optional fields when present', () => {
      // Arrange
      const session = createMockSession({
        ipAddress: '10.0.0.1',
        userAgent: 'curl/7.68.0'
      });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.ipAddress).toBe('10.0.0.1');
      expect(dto.userAgent).toBe('curl/7.68.0');
    });

    it('should handle inactive session', () => {
      // Arrange
      const session = createMockSession({ active: false });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.active).toBe(false);
    });

    it('should preserve date objects', () => {
      // Arrange
      const session = createMockSession();

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.expiresAt).toBeInstanceOf(Date);
      expect(dto.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle different userId values', () => {
      // Arrange
      const session = createMockSession({ userId: 999999 });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.userId).toBe(999999);
    });

    it('should handle different tenantId formats', () => {
      // Arrange
      const session = createMockSession({ tenantId: 'org-12345-uuid' });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.tenantId).toBe('org-12345-uuid');
    });

    it('should handle expired session dates', () => {
      // Arrange
      const pastDate = new Date('2020-01-01T00:00:00.000Z');
      const session = createMockSession({ expiresAt: pastDate });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.expiresAt).toEqual(pastDate);
    });

    it('should handle future expiration dates', () => {
      // Arrange
      const futureDate = new Date('2030-01-01T00:00:00.000Z');
      const session = createMockSession({ expiresAt: futureDate });

      // Act
      const dto = SessionDto.fromEntity(session);

      // Assert
      expect(dto.expiresAt).toEqual(futureDate);
    });
  });
});
