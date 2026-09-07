import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateContentEntryDto } from '../create-content-entry.dto';

describe('CreateContentEntryDto', () => {
  it('accepts a valid org-scoped payload', async () => {
    const dto = plainToInstance(CreateContentEntryDto, {
      title: 'Roadmap',
      contentMarkdown: '# Roadmap'
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts optional projectId, parentId, and slug', async () => {
    const dto = plainToInstance(CreateContentEntryDto, {
      title: 'Setup',
      contentMarkdown: '# Setup',
      slug: 'setup',
      projectId: 12,
      parentId: 34
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects whitespace-only titles', async () => {
    const dto = plainToInstance(CreateContentEntryDto, {
      title: '   ',
      contentMarkdown: '# Setup'
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects whitespace-only markdown bodies', async () => {
    const dto = plainToInstance(CreateContentEntryDto, {
      title: 'Setup',
      contentMarkdown: '   '
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
