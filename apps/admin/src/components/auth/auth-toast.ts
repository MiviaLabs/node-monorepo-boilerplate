export type AuthToastPayload = {
  description: string;
  title: string;
  variant: 'error' | 'success';
};

export function getLoginSuccessToastPayload(message: string): AuthToastPayload {
  return {
    variant: 'success',
    title: 'Session established',
    description: message
  };
}

export function getLoginErrorToastPayload(message: string): AuthToastPayload {
  return {
    variant: 'error',
    title: 'Sign-in blocked',
    description: message
  };
}

export function getPasswordResetSuccessToastPayload(message: string): AuthToastPayload {
  return {
    variant: 'success',
    title: 'Reset request queued',
    description: message
  };
}

export function getPasswordResetErrorToastPayload(message: string): AuthToastPayload {
  return {
    variant: 'error',
    title: 'Unable to start reset',
    description: message
  };
}
