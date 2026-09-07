import { RequestPasswordResetCommand } from '../../../commands/request-password-reset.command';
import { PasswordResetRequestedEvent } from '../../../events/password-reset-requested.event';
import { RequestPasswordResetHandler } from '../request-password-reset.handler';

describe('RequestPasswordResetHandler', () => {
  it('should return generic success when user does not exist globally', async () => {
    const authRepository = {
      findByEmail: jest.fn().mockResolvedValue(null) // User not found
    };
    const passwordResetRepository = {
      countRecentByEmailHash: jest.fn(),
      invalidateAllForUser: jest.fn(),
      createTokenWithTransaction: jest.fn()
    };
    const eventBus = { publish: jest.fn() };
    const auditOutbox = { insert: jest.fn() };
    const db = { transaction: jest.fn() };

    const handler = new RequestPasswordResetHandler(
      authRepository as never,
      passwordResetRepository as never,
      eventBus as never,
      auditOutbox as never,
      db as never
    );

    const result = await handler.execute(
      new RequestPasswordResetCommand({
        tenantId: 'public',
        email: 'missing@example.com'
      })
    );

    expect(result).toEqual({
      success: true,
      message: 'If the email exists, a reset link has been sent'
    });
    expect(authRepository.findByEmail).toHaveBeenCalledWith(undefined, 'missing@example.com');
    expect(passwordResetRepository.countRecentByEmailHash).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(auditOutbox.insert).not.toHaveBeenCalled();
  });

  it('should create token and publish PasswordResetRequestedEvent for existing user', async () => {
    const authRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 7,
        organizationId: 44 // User belongs to organization 44
      })
    };
    const passwordResetRepository = {
      countRecentByEmailHash: jest.fn().mockResolvedValue(0),
      invalidateAllForUser: jest.fn().mockResolvedValue(1),
      createTokenWithTransaction: jest.fn().mockResolvedValue({
        token: { id: 10 },
        resetToken: 'raw-token-123'
      })
    };
    const eventBus = {
      publish: jest.fn().mockResolvedValue(undefined)
    };
    const auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const db = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({}))
    };

    const handler = new RequestPasswordResetHandler(
      authRepository as never,
      passwordResetRepository as never,
      eventBus as never,
      auditOutbox as never,
      db as never
    );

    const result = await handler.execute(
      new RequestPasswordResetCommand({
        tenantId: 'public',
        email: 'user@example.com'
      })
    );

    expect(authRepository.findByEmail).toHaveBeenCalledWith(undefined, 'user@example.com');
    expect(passwordResetRepository.countRecentByEmailHash).toHaveBeenCalledWith(
      44, // user.organizationId
      expect.any(String),
      expect.any(Date)
    );
    expect(passwordResetRepository.invalidateAllForUser).toHaveBeenCalledWith(
      44, // user.organizationId
      7, // user.id
      expect.any(Object)
    );
    expect(passwordResetRepository.createTokenWithTransaction).toHaveBeenCalled();
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'auth.password.reset.requested.audit',
        payload: expect.objectContaining({
          details: expect.objectContaining({
            expiresInMinutes: 60
          })
        })
      })
    );
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(PasswordResetRequestedEvent));
    expect(result.success).toBe(true);
  });

  it('should not create token when email rate limit threshold is reached', async () => {
    const authRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 7,
        organizationId: 44
      })
    };
    const passwordResetRepository = {
      countRecentByEmailHash: jest.fn().mockResolvedValue(3), // At limit
      invalidateAllForUser: jest.fn(),
      createTokenWithTransaction: jest.fn()
    };
    const eventBus = {
      publish: jest.fn()
    };
    const auditOutbox = {
      insert: jest.fn()
    };

    const db = {
      transaction: jest.fn()
    };

    const handler = new RequestPasswordResetHandler(
      authRepository as never,
      passwordResetRepository as never,
      eventBus as never,
      auditOutbox as never,
      db as never
    );

    const result = await handler.execute(
      new RequestPasswordResetCommand({
        tenantId: 'public',
        email: 'user@example.com'
      })
    );

    expect(authRepository.findByEmail).toHaveBeenCalledWith(undefined, 'user@example.com');
    expect(passwordResetRepository.countRecentByEmailHash).toHaveBeenCalledWith(
      44, // user.organizationId
      expect.any(String),
      expect.any(Date)
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(auditOutbox.insert).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('should create token when count is just below rate limit threshold (2 of 3)', async () => {
    const authRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 7,
        organizationId: 1
      })
    };
    const passwordResetRepository = {
      countRecentByEmailHash: jest.fn().mockResolvedValue(2), // Just below limit (3)
      invalidateAllForUser: jest.fn().mockResolvedValue(0),
      createTokenWithTransaction: jest.fn().mockResolvedValue({
        token: { id: 10 },
        resetToken: 'token-456'
      })
    };
    const eventBus = {
      publish: jest.fn().mockResolvedValue(undefined)
    };
    const auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const db = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({}))
    };

    const handler = new RequestPasswordResetHandler(
      authRepository as never,
      passwordResetRepository as never,
      eventBus as never,
      auditOutbox as never,
      db as never
    );

    const command = new RequestPasswordResetCommand({
      tenantId: 'public',
      email: 'test@example.com'
    });

    const result = await handler.execute(command);

    expect(authRepository.findByEmail).toHaveBeenCalledWith(undefined, 'test@example.com');
    expect(passwordResetRepository.countRecentByEmailHash).toHaveBeenCalledWith(
      1, // user.organizationId
      expect.any(String),
      expect.any(Date)
    );
    // Should create token since 2 < 3 limit
    expect(passwordResetRepository.createTokenWithTransaction).toHaveBeenCalled();
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
