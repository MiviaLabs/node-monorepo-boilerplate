/**
 * Unit Tests for TransferOwnershipDto
 *
 * Tests validation for organization ownership transfer requests.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TransferOwnershipDto } from '../transfer-ownership.dto';

import type { ValidationError } from 'class-validator';

describe('TransferOwnershipDto', () => {
  const validateDto = async (dto: TransferOwnershipDto): Promise<ValidationError[]> => {
    const instance = plainToInstance(TransferOwnershipDto, dto);
    return validate(instance);
  };

  describe('newOwnerId validation', () => {
    it('should pass with valid numeric string', async () => {
      // Arrange
      const dto = { newOwnerId: '123' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with large numeric string', async () => {
      // Arrange
      const dto = { newOwnerId: '999999999' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with single digit', async () => {
      // Arrange
      const dto = { newOwnerId: '1' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with non-numeric string', async () => {
      // Arrange
      const dto = { newOwnerId: 'abc' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['matches']).toBeDefined();
    });

    it('should fail with alphanumeric string', async () => {
      // Arrange
      const dto = { newOwnerId: '123abc' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['matches']).toBeDefined();
    });

    it('should fail with negative number string', async () => {
      // Arrange
      const dto = { newOwnerId: '-123' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['matches']).toBeDefined();
    });

    it('should fail with decimal number string', async () => {
      // Arrange
      const dto = { newOwnerId: '123.45' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['matches']).toBeDefined();
    });

    it('should fail with empty string', async () => {
      // Arrange
      const dto = { newOwnerId: '' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with missing newOwnerId', async () => {
      // Arrange
      const dto = {} as TransferOwnershipDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with whitespace string', async () => {
      // Arrange
      const dto = { newOwnerId: '   ' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with number type instead of string', async () => {
      // Arrange
      const dto = { newOwnerId: 123 as unknown as string };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('reason validation', () => {
    it('should pass without reason (optional)', async () => {
      // Arrange
      const dto = { newOwnerId: '123' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with valid reason', async () => {
      // Arrange
      const dto = { newOwnerId: '123', reason: 'Organizational restructuring' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with empty reason string', async () => {
      // Arrange
      const dto = { newOwnerId: '123', reason: '' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with long reason', async () => {
      // Arrange
      const dto = { newOwnerId: '123', reason: 'a'.repeat(500) };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with non-string reason', async () => {
      // Arrange
      const dto = { newOwnerId: '123', reason: 123 as unknown as string };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isString']).toBeDefined();
    });
  });

  describe('combined validation', () => {
    it('should pass with valid newOwnerId and reason', async () => {
      // Arrange
      const dto = { newOwnerId: '456', reason: 'CEO transition' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return error only for invalid newOwnerId when reason is valid', async () => {
      // Arrange
      const dto = { newOwnerId: 'invalid', reason: 'Valid reason' };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('newOwnerId');
    });

    it('should return errors for both invalid fields', async () => {
      // Arrange
      const dto = { newOwnerId: 'invalid', reason: 123 as unknown as string };

      // Act
      const errors = await validateDto(dto as TransferOwnershipDto);

      // Assert
      expect(errors.length).toBe(2);
    });
  });
});
