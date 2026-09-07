import {
  getLoginErrorToastPayload,
  getLoginSuccessToastPayload,
  getPasswordResetErrorToastPayload,
  getPasswordResetSuccessToastPayload
} from './auth-toast';

describe('auth toast payloads', () => {
  it('builds login success feedback', () => {
    expect(getLoginSuccessToastPayload('Signed in.')).toEqual({
      variant: 'success',
      title: 'Session established',
      description: 'Signed in.'
    });
  });

  it('builds login error feedback', () => {
    expect(getLoginErrorToastPayload('Locked account.')).toEqual({
      variant: 'error',
      title: 'Sign-in blocked',
      description: 'Locked account.'
    });
  });

  it('builds password reset success feedback', () => {
    expect(getPasswordResetSuccessToastPayload('Instructions sent.')).toEqual({
      variant: 'success',
      title: 'Reset request queued',
      description: 'Instructions sent.'
    });
  });

  it('builds password reset error feedback', () => {
    expect(getPasswordResetErrorToastPayload('Try again later.')).toEqual({
      variant: 'error',
      title: 'Unable to start reset',
      description: 'Try again later.'
    });
  });
});
