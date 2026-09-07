import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateContentEntryDto } from '../update-content-entry.dto';

describe('UpdateContentEntryDto', () => {
  it('accepts partial updates', async () => {
    const dto = plainToInstance(UpdateContentEntryDto, {
      title: 'Updated setup'
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects whitespace-only titles', async () => {
    const dto = plainToInstance(UpdateContentEntryDto, {
      title: '   '
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects whitespace-only explicit slugs', async () => {
    const dto = plainToInstance(UpdateContentEntryDto, {
      slug: '   '
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
