import { PasswordResetRequestedEvent } from '../../../events/password-reset-requested.event';
import { PasswordResetRequestedHandler } from '../password-reset-requested.handler';

describe('PasswordResetRequestedHandler', () => {
  it('should send tracked password reset email with encoded token URL', async () => {
    const emailService = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined)
    };
    const trackedEmailService = {
      sendTrackedEmail: jest.fn().mockResolvedValue(undefined)
    };
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'PASSWORD_RESET_WEBAPP_URL') return 'https://accounts.example.com';
        if (key === 'BRAND_NAME') return 'Starter';
        return fallback;
      })
    };

    const handler = new PasswordResetRequestedHandler(
      emailService as never,
      configService as never,
      trackedEmailService as never
    );

    await handler.handle(
      new PasswordResetRequestedEvent('1', 5, 'user@example.com', 'raw token', new Date())
    );

    expect(trackedEmailService.sendTrackedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        request: expect.objectContaining({
          to: 'user@example.com',
          subject: 'Reset Your Password',
          html: expect.stringContaining(
            'https://accounts.example.com/auth/reset-password?token=raw%20token'
          ),
          emailTracking: expect.objectContaining({
            messageKind: 'password_reset_requested',
            referenceType: 'user',
            referenceId: '5'
          })
        })
      })
    );
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });
});
