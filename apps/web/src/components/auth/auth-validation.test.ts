import { describe, expect, it } from 'vitest';

import {
  getRegisterValidationData,
  registerSchema,
  type RegisterFormData
} from './auth-validation';

function buildFormData(overrides: Partial<RegisterFormData> = {}): RegisterFormData {
  return {
    displayName: 'Jane Doe',
    organizationName: 'Acme Inc',
    organizationSlug: 'acme-inc',
    email: 'jane@example.com',
    password: 'StrongPass1!',
    confirmPassword: 'StrongPass1!',
    terms: true,
    ...overrides
  };
}

describe('getRegisterValidationData', () => {
  it('generates organization slug for standard registration', () => {
    const input = buildFormData({
      organizationName: 'Acme & Partners',
      organizationSlug: ''
    });

    const normalized = getRegisterValidationData(input, false);
    const result = registerSchema.safeParse(normalized);

    expect(normalized.organizationSlug).toBe('acme-partners');
    expect(result.success).toBe(true);
  });

  it('omits organization fields for invitation acceptance validation', () => {
    const input = buildFormData({
      organizationName: '',
      organizationSlug: ''
    });

    const normalized = getRegisterValidationData(input, true);
    const result = registerSchema.safeParse(normalized);

    expect(normalized.organizationName).toBeUndefined();
    expect(normalized.organizationSlug).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it('preserves organization validation for standard registration', () => {
    const input = buildFormData({
      organizationName: '',
      organizationSlug: ''
    });

    const normalized = getRegisterValidationData(input, false);
    const result = registerSchema.safeParse(normalized);

    expect(normalized.organizationName).toBe('');
    expect(normalized.organizationSlug).toBe('');
    expect(result.success).toBe(false);
  });
});
