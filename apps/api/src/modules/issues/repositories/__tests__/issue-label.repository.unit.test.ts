import { describe, expect, it } from '@jest/globals';

import { IssueLabelRepository } from '../issue-label.repository';

describe('IssueLabelRepository', () => {
  it('treats tenant_owner as an admin role for label visibility', () => {
    const repository = new IssueLabelRepository({} as never);
    const isAdmin = (
      repository as unknown as {
        isAdmin: (roles?: readonly string[]) => boolean;
      }
    ).isAdmin.bind(repository);

    expect(isAdmin(['tenant_owner'])).toBe(true);
    expect(isAdmin(['tenant_admin'])).toBe(true);
    expect(isAdmin(['tenant_user'])).toBe(false);
  });
});
