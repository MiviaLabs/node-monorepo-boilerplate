import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateProjectDto } from '../create-project.dto';

describe('CreateProjectDto', () => {
  it('accepts a valid name and visibility', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'Roadmap',
      visibility: 'public'
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects unsupported visibility values', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'Roadmap',
      visibility: 'secret'
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it('rejects whitespace-only names', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: '   ',
      visibility: 'public'
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
