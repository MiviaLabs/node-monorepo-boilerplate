import { PasswordResetCompletedEvent } from '../../../events/password-reset-completed.event';
import { PasswordResetCompletedHandler } from '../password-reset-completed.handler';

describe('PasswordResetCompletedHandler', () => {
  it('should skip sending when email is not deliverable', async () => {
    const emailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined)
    };
    const trackedEmailService = {
      sendTrackedEmail: jest.fn().mockResolvedValue(undefined)
    };
    const configService = {
      get: jest.fn((_: string, fallback: string) => fallback)
    };

    const handler = new PasswordResetCompletedHandler(
      emailService as never,
      configService as never,
      trackedEmailService as never
    );

    await handler.handle(new PasswordResetCompletedEvent('1', 5, 'not-an-email', 'token'));

    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(trackedEmailService.sendTrackedEmail).not.toHaveBeenCalled();
  });
});
