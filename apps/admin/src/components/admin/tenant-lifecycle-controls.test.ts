import { describe, expect, it } from 'vitest';

import {
  getCreateTenantValidationError,
  getUpdateTenantValidationError
} from './tenant-lifecycle-controls';

describe('getCreateTenantValidationError', () => {
  it('requires a valid slug for tenant creation', () => {
    expect(
      getCreateTenantValidationError({
        name: 'Acme',
        slug: 'Acme'
      })
    ).toBe('Tenant slug must contain only lowercase letters, numbers, and hyphens');
  });

  it('rejects oversize slugs before the database does', () => {
    expect(
      getCreateTenantValidationError({
        name: 'Acme',
        slug: 'a'.repeat(51)
      })
    ).toBe('Tenant slug must be 50 characters or fewer');
  });
});

describe('getUpdateTenantValidationError', () => {
  it('rejects no-op lifecycle updates', () => {
    expect(
      getUpdateTenantValidationError(
        {
          name: 'Acme',
          slug: 'acme',
          status: ''
        },
        {
          name: 'Acme',
          slug: 'acme',
          status: 'active'
        }
      )
    ).toBe('No lifecycle changes to save');
  });

  it('accepts a supported status transition', () => {
    expect(
      getUpdateTenantValidationError(
        {
          name: 'Acme',
          slug: 'acme',
          status: 'suspended'
        },
        {
          name: 'Acme',
          slug: 'acme',
          status: 'active'
        }
      )
    ).toBeNull();
  });
});
