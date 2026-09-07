import { ValidatePasswordResetTokenQuery } from '../../../queries/validate-password-reset-token.query';
import { ValidatePasswordResetTokenHandler } from '../validate-password-reset-token.handler';

describe('ValidatePasswordResetTokenHandler', () => {
  it('should resolve token using global lookup and return valid status', async () => {
    const passwordResetRepository = {
      findByTokenHashGlobal: jest.fn().mockResolvedValue({
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000)
      })
    };

    const handler = new ValidatePasswordResetTokenHandler(passwordResetRepository as never);

    const result = await handler.execute(
      new ValidatePasswordResetTokenQuery({ token: 'raw-token' })
    );

    expect(passwordResetRepository.findByTokenHashGlobal).toHaveBeenCalledTimes(1);
    expect(result.isValid).toBe(true);
    expect(result.status).toBe('valid');
  });

  it('should return not-found when token does not exist', async () => {
    const passwordResetRepository = {
      findByTokenHashGlobal: jest.fn().mockResolvedValue(null)
    };

    const handler = new ValidatePasswordResetTokenHandler(passwordResetRepository as never);
    const result = await handler.execute(
      new ValidatePasswordResetTokenQuery({ token: 'missing-token' })
    );

    expect(result).toEqual({ isValid: false, status: 'not-found' });
  });

  it('should return used when token is already consumed', async () => {
    const passwordResetRepository = {
      findByTokenHashGlobal: jest.fn().mockResolvedValue({
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000)
      })
    };

    const handler = new ValidatePasswordResetTokenHandler(passwordResetRepository as never);
    const result = await handler.execute(
      new ValidatePasswordResetTokenQuery({ token: 'used-token' })
    );

    expect(result).toEqual({ isValid: false, status: 'used' });
  });

  it('should return expired when token is expired', async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    const passwordResetRepository = {
      findByTokenHashGlobal: jest.fn().mockResolvedValue({
        usedAt: null,
        expiresAt: expiredAt
      })
    };

    const handler = new ValidatePasswordResetTokenHandler(passwordResetRepository as never);
    const result = await handler.execute(
      new ValidatePasswordResetTokenQuery({ token: 'expired-token' })
    );

    expect(result).toEqual({ isValid: false, status: 'expired', expiresAt: expiredAt });
  });
});
