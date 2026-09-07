/**
 * Unit Tests for UpdateMemberRoleDto
 *
 * Tests DTO validation for member role updates.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateMemberRoleDto } from '../update-member-role.dto';

describe('UpdateMemberRoleDto', () => {
  describe('valid roles', () => {
    it('should accept tenant_owner role', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {
        role: 'tenant_owner'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should accept tenant_admin role', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {
        role: 'tenant_admin'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should accept tenant_user role', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {
        role: 'tenant_user'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should accept tenant_viewer role', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {
        role: 'tenant_viewer'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });
  });

  describe('invalid roles', () => {
    it('should reject invalid role', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {
        role: 'invalid_role'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('role');
      expect(errors[0]?.constraints?.['isEnum']).toBeDefined();
    });

    it('should reject empty role', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {
        role: ''
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('role');
    });

    it('should reject missing role', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {});

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject admin without tenant_ prefix', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {
        role: 'admin'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('role');
    });

    it('should reject number as role', async () => {
      // Arrange
      const dto = plainToInstance(UpdateMemberRoleDto, {
        role: 123
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(1);
    });
  });
});
