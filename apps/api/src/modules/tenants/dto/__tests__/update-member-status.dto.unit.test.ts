/**
 * Unit Tests for UpdateMemberStatusDto
 *
 * Tests DTO validation for member status updates.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MemberStatus, UpdateMemberStatusDto } from '../update-member-status.dto';

describe('UpdateMemberStatusDto', () => {
  describe('valid statuses', () => {
    it('should accept active status', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: MemberStatus.ACTIVE
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should accept inactive status', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: MemberStatus.INACTIVE
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should accept suspended status', async () => {
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: MemberStatus.SUSPENDED
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should accept pending status', async () => {
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: MemberStatus.PENDING
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should accept status as string literals', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: 'active'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });
  });

  describe('invalid statuses', () => {
    it('should reject invalid status', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: 'invalid_status'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('status');
      expect(errors[0]?.constraints?.['isEnum']).toBeDefined();
    });

    it('should reject empty status', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: ''
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('status');
    });

    it('should reject missing status', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {});

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject uppercase status', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: 'ACTIVE'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('status');
    });

    it('should reject number as status', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: 1
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
    });

    it('should reject boolean as status', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberStatusDto, {
        status: true
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
    });
  });

  describe('MemberStatus enum', () => {
    it('should have expected values', () => {
      expect(MemberStatus.ACTIVE).toBe('active');
      expect(MemberStatus.INACTIVE).toBe('inactive');
      expect(MemberStatus.SUSPENDED).toBe('suspended');
      expect(MemberStatus.PENDING).toBe('pending');
    });

    it('should have 4 status values', () => {
      const values = Object.values(MemberStatus);
      expect(values).toHaveLength(4);
    });
  });
});
