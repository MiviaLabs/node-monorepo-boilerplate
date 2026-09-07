import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateProjectDto } from '../update-project.dto';

describe('UpdateProjectDto', () => {
  it('accepts partial updates', async () => {
    const dto = plainToInstance(UpdateProjectDto, {
      visibility: 'private'
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid visibility values', async () => {
    const dto = plainToInstance(UpdateProjectDto, {
      visibility: 'restricted'
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it('rejects whitespace-only names', async () => {
    const dto = plainToInstance(UpdateProjectDto, {
      name: '   '
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
