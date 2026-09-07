import { describe, expect, it, jest } from '@jest/globals';

import { CreateContentEntryCommand } from '../../../commands/create-content-entry.command';
import { CreateContentEntryDto } from '../../../dto';
import { CreateContentEntryHandler } from '../create-content-entry.handler';

describe('CreateContentEntryHandler', () => {
  it('delegates creation to the content service with actor context', async () => {
    const dto = new CreateContentEntryDto();
    dto.title = 'Getting Started';
    dto.contentMarkdown = '# Getting Started';

    const contentService = {
      createEntry: jest.fn(async () => ({ id: 1, title: 'Getting Started' }))
    };

    const handler = new CreateContentEntryHandler(contentService as never);
    await handler.execute(
      new CreateContentEntryCommand('12', '34', 'actor-34', ['tenant_user'], dto, {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      })
    );

    expect(contentService.createEntry as jest.Mock).toHaveBeenCalledWith(
      '12',
      '34',
      'actor-34',
      ['tenant_user'],
      dto,
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      }
    );
  });
});
