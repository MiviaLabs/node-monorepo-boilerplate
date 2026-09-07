import { createHash } from 'node:crypto';

import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { ValidateTokenResponseDto } from '../../dto/validate-token-response.dto';
import { ValidatePasswordResetTokenQuery } from '../../queries/validate-password-reset-token.query';
import { PasswordResetRepository } from '../../repositories/password-reset.repository';

/**
 * Validate password reset token query handler
 *
 * Checks if a password reset token is valid by:
 * 1. Hashing the plain token with SHA-256
 * 2. Looking up the token hash in the database
 * 3. Checking if token exists, is not used, and is not expired
 *
 * Returns validation result with status:
 * - 'valid': Token exists, not used, not expired
 * - 'expired': Token exists but has expired
 * - 'used': Token exists but has already been used
 * - 'not-found': Token does not exist in database
 */
@QueryHandler(ValidatePasswordResetTokenQuery)
export class ValidatePasswordResetTokenHandler implements IQueryHandler<
  ValidatePasswordResetTokenQuery,
  ValidateTokenResponseDto
> {
  constructor(private readonly passwordResetRepository: PasswordResetRepository) {}

  async execute(query: ValidatePasswordResetTokenQuery): Promise<ValidateTokenResponseDto> {
    // Hash the token using SHA-256 for database lookup
    const tokenHash = createHash('sha256').update(query.token).digest('hex');

    // Look up the token in the database
    const resetRecord = await this.passwordResetRepository.findByTokenHashGlobal(tokenHash);

    // Token not found in database
    if (!resetRecord) {
      return {
        isValid: false,
        status: 'not-found'
      };
    }

    // Token has already been used
    if (resetRecord.usedAt !== null) {
      return {
        isValid: false,
        status: 'used'
      };
    }

    // Token has expired
    const now = new Date();
    if (resetRecord.expiresAt < now) {
      return {
        isValid: false,
        status: 'expired',
        expiresAt: resetRecord.expiresAt
      };
    }

    // Token is valid
    return {
      isValid: true,
      status: 'valid',
      expiresAt: resetRecord.expiresAt
    };
  }
}
