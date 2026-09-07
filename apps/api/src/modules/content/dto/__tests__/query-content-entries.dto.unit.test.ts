import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ContentQueryScope, QueryContentEntriesDto } from '../query-content-entries.dto';

describe('QueryContentEntriesDto', () => {
  it('accepts optional scope filters', async () => {
    const dto = plainToInstance(QueryContentEntriesDto, {
      scope: ContentQueryScope.PROJECT,
      projectId: 12,
      parentId: 34,
      slug: 'setup-guide'
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects non-numeric projectId values', async () => {
    const dto = plainToInstance(QueryContentEntriesDto, {
      projectId: 'not-a-number'
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unsupported scope values', async () => {
    const dto = plainToInstance(QueryContentEntriesDto, {
      scope: 'tenant'
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
