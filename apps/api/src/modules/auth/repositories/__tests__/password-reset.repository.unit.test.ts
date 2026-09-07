import { passwordResetTokens } from '@package/db-core';

import { PasswordResetRepository } from '../password-reset.repository';

describe('PasswordResetRepository', () => {
  it('should generate 32-byte (64 hex chars) reset token', async () => {
    const tx = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 1,
              organizationId: 1,
              userId: 10,
              tokenHash: 'hash',
              emailHash: 'email-hash',
              expiresAt: new Date(),
              usedAt: null,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          ])
        })
      })
    };

    const db = {
      transaction: jest.fn(async (fn: (arg: unknown) => Promise<unknown>) => fn(tx))
    };

    const repository = new PasswordResetRepository(db as never);

    const result = await repository.createToken({
      organizationId: 1,
      userId: 10,
      emailHash: 'email-hash',
      expiresAt: new Date(Date.now() + 3600_000)
    });

    expect(tx.insert).toHaveBeenCalledWith(passwordResetTokens);
    expect(result.resetToken).toMatch(/^[a-f0-9]{64}$/);
  });
});
