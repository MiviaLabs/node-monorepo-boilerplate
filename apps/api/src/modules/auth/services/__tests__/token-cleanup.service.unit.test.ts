import { TokenCleanupService } from '../token-cleanup.service';

describe('TokenCleanupService', () => {
  const buildDbMock = (
    orgIds: number[]
  ): {
    select: jest.Mock;
  } => ({
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(orgIds.map((id) => ({ id })))
      })
    })
  });

  it('should cleanup expired tokens for all active organizations', async () => {
    const db = buildDbMock([1, 2, 3]);
    const passwordResetRepository = {
      deleteExpiredTokens: jest
        .fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
      deleteUsedTokens: jest.fn()
    };

    const service = new TokenCleanupService(db as never, passwordResetRepository as never);

    await service.cleanupExpiredTokens();

    expect(passwordResetRepository.deleteExpiredTokens).toHaveBeenCalledTimes(3);
    expect(passwordResetRepository.deleteExpiredTokens).toHaveBeenNthCalledWith(
      1,
      1,
      expect.any(Date)
    );
    expect(passwordResetRepository.deleteExpiredTokens).toHaveBeenNthCalledWith(
      2,
      2,
      expect.any(Date)
    );
    expect(passwordResetRepository.deleteExpiredTokens).toHaveBeenNthCalledWith(
      3,
      3,
      expect.any(Date)
    );
  });

  it('should cleanup used tokens for all active organizations', async () => {
    const db = buildDbMock([1, 2]);
    const passwordResetRepository = {
      deleteExpiredTokens: jest.fn(),
      deleteUsedTokens: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(3)
    };

    const service = new TokenCleanupService(db as never, passwordResetRepository as never);

    await service.cleanupUsedTokens();

    expect(passwordResetRepository.deleteUsedTokens).toHaveBeenCalledTimes(2);
    expect(passwordResetRepository.deleteUsedTokens).toHaveBeenNthCalledWith(
      1,
      1,
      expect.any(Date)
    );
    expect(passwordResetRepository.deleteUsedTokens).toHaveBeenNthCalledWith(
      2,
      2,
      expect.any(Date)
    );
  });

  it('should return manual cleanup statistics', async () => {
    const db = buildDbMock([10, 11]);
    const passwordResetRepository = {
      deleteExpiredTokens: jest.fn().mockResolvedValue(5),
      deleteUsedTokens: jest.fn().mockResolvedValue(7)
    };

    const service = new TokenCleanupService(db as never, passwordResetRepository as never);

    const result = await service.runManualCleanup();

    expect(result).toEqual({
      expiredTokensDeleted: 10,
      usedTokensDeleted: 14,
      organizationsProcessed: 2
    });
  });
});
