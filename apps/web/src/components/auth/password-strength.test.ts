import { describe, expect, it } from 'vitest';

import { getPasswordStrength } from './password-strength';

describe('getPasswordStrength', () => {
  it('returns weak for empty passwords', () => {
    expect(getPasswordStrength('')).toBe('weak');
  });

  it('returns medium for partially complete passwords', () => {
    expect(getPasswordStrength('Password1')).toBe('medium');
  });

  it('returns strong for passwords that satisfy all checks', () => {
    expect(getPasswordStrength('StrongPass1!')).toBe('strong');
  });
});
