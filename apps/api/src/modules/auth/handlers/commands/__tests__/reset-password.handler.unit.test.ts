import { Errors } from '@package/errors';

import { ResetPasswordCommand } from '../../../commands/reset-password.command';
import { ResetPasswordHandler } from '../reset-password.handler';

describe('ResetPasswordHandler', () => {
  it('should use organization from token record, not command payload', async () => {
    const resetToken = {
      id: 22,
      userId: 7,
      organizationId: 44
    };

    const userRepository = {
      findById: jest.fn().mockResolvedValue({ id: 7, emailHash: 'email-hash' })
    };
    const userIdentityRepository = {
      findPrimaryByUserId: jest.fn().mockResolvedValue({ providerUid: 'provider-uid-1' })
    };
    const authRepository = {
      findOrganizationById: jest.fn().mockResolvedValue({ gcpTenantId: 'gcp-tenant-44' })
    };
    const passwordResetRepository = {
      findActiveByTokenHashGlobal: jest.fn().mockResolvedValue(resetToken),
      markAsUsed: jest.fn().mockResolvedValue({ id: 22 }),
      invalidateAllForUser: jest.fn().mockResolvedValue(1)
    };
    const authProvider = {
      changePassword: jest.fn().mockResolvedValue(undefined),
      getUserInfo: jest.fn().mockResolvedValue({ email: 'user@example.com' })
    };
    const authProviderFactory = {
      getDefaultProvider: jest.fn().mockReturnValue(authProvider)
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

    const handler = new ResetPasswordHandler(
      userRepository as never,
      userIdentityRepository as never,
      authRepository as never,
      passwordResetRepository as never,
      authProviderFactory as never,
      eventBus as never,
      auditOutbox as never,
      db as never
    );

    const result = await handler.execute(
      new ResetPasswordCommand({
        tenantId: 'public',
        token: 'raw-token',
        newPassword: 'NewPass123!'
      })
    );

    expect(userRepository.findById).toHaveBeenCalledWith(44, 7);
    expect(passwordResetRepository.markAsUsed).toHaveBeenCalledWith(44, 22, expect.any(Object));
    expect(passwordResetRepository.invalidateAllForUser).toHaveBeenCalledWith(
      44,
      7,
      expect.any(Object)
    );
    expect(authProvider.changePassword).toHaveBeenCalledWith(
      'provider-uid-1',
      'NewPass123!',
      'gcp-tenant-44'
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'auth.password.reset.completed.audit'
      })
    );
    expect(authProvider.getUserInfo).toHaveBeenCalledWith('provider-uid-1', 'gcp-tenant-44');
    expect(eventBus.publish).toHaveBeenCalled();
    expect(result).toEqual({ success: true, message: 'Password reset successfully' });
  });

  it('should throw when token cannot be marked as used', async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue({ id: 7 })
    };
    const userIdentityRepository = {
      findPrimaryByUserId: jest.fn().mockResolvedValue({ providerUid: 'provider-uid-1' })
    };
    const authRepository = {
      findOrganizationById: jest.fn().mockResolvedValue({ gcpTenantId: 'gcp-tenant-44' })
    };
    const passwordResetRepository = {
      findActiveByTokenHashGlobal: jest
        .fn()
        .mockResolvedValue({ id: 22, userId: 7, organizationId: 44 }),
      markAsUsed: jest.fn().mockResolvedValue(null),
      invalidateAllForUser: jest.fn().mockResolvedValue(0)
    };
    const authProvider = {
      changePassword: jest.fn().mockResolvedValue(undefined),
      getUserInfo: jest.fn().mockResolvedValue({ email: 'user@example.com' })
    };
    const authProviderFactory = {
      getDefaultProvider: jest.fn().mockReturnValue(authProvider)
    };
    const eventBus = {
      publish: jest.fn().mockResolvedValue(undefined)
    };
    const auditOutbox = { insert: jest.fn() };
    const db = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({}))
    };

    const handler = new ResetPasswordHandler(
      userRepository as never,
      userIdentityRepository as never,
      authRepository as never,
      passwordResetRepository as never,
      authProviderFactory as never,
      eventBus as never,
      auditOutbox as never,
      db as never
    );

    await expect(
      handler.execute(
        new ResetPasswordCommand({
          tenantId: 'public',
          token: 'raw-token',
          newPassword: 'NewPass123!'
        })
      )
    ).rejects.toEqual(Errors.authauthenticationTokenIs003({}));
  });

  it('should throw when user not found after token lookup', async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue(null) // User deleted or moved
    };
    const userIdentityRepository = { findPrimaryByUserId: jest.fn() };
    const authRepository = { findOrganizationById: jest.fn() };
    const passwordResetRepository = {
      findActiveByTokenHashGlobal: jest.fn().mockResolvedValue({
        id: 22,
        userId: 99,
        organizationId: 44,
        tokenHash: 'hash123',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null
      })
    };
    const authProvider = { changePassword: jest.fn() };
    const authProviderFactory = {
      getDefaultProvider: jest.fn().mockReturnValue(authProvider)
    };
    const eventBus = { publish: jest.fn() };
    const auditOutbox = { insert: jest.fn() };
    const db = { transaction: jest.fn() };

    const handler = new ResetPasswordHandler(
      userRepository as never,
      userIdentityRepository as never,
      authRepository as never,
      passwordResetRepository as never,
      authProviderFactory as never,
      eventBus as never,
      auditOutbox as never,
      db as never
    );

    await expect(
      handler.execute(
        new ResetPasswordCommand({
          tenantId: 'public',
          token: 'raw-token',
          newPassword: 'NewPass123!'
        })
      )
    ).rejects.toEqual(Errors.useruserWithId001({ userId: '99' }));
  });

  it('should throw when primary identity not found for user', async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue({ id: 7, emailHash: 'hash' })
    };
    const userIdentityRepository = {
      findPrimaryByUserId: jest.fn().mockResolvedValue(null) // No identity
    };
    const authRepository = { findOrganizationById: jest.fn() };
    const passwordResetRepository = {
      findActiveByTokenHashGlobal: jest.fn().mockResolvedValue({
        id: 22,
        userId: 7,
        organizationId: 44,
        tokenHash: 'hash123',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null
      })
    };
    const authProvider = { changePassword: jest.fn() };
    const authProviderFactory = {
      getDefaultProvider: jest.fn().mockReturnValue(authProvider)
    };
    const eventBus = { publish: jest.fn() };
    const auditOutbox = { insert: jest.fn() };
    const db = { transaction: jest.fn() };

    const handler = new ResetPasswordHandler(
      userRepository as never,
      userIdentityRepository as never,
      authRepository as never,
      passwordResetRepository as never,
      authProviderFactory as never,
      eventBus as never,
      auditOutbox as never,
      db as never
    );

    await expect(
      handler.execute(
        new ResetPasswordCommand({
          tenantId: 'public',
          token: 'raw-token',
          newPassword: 'NewPass123!'
        })
      )
    ).rejects.toEqual(Errors.authauthenticationTokenIs003({}));
  });
});
