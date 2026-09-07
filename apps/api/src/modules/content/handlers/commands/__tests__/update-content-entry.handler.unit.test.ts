import { describe, expect, it, jest } from '@jest/globals';

import { UpdateContentEntryCommand } from '../../../commands/update-content-entry.command';
import { UpdateContentEntryDto } from '../../../dto';
import { UpdateContentEntryHandler } from '../update-content-entry.handler';

describe('UpdateContentEntryHandler', () => {
  it('delegates updates to the content service with actor context', async () => {
    const dto = new UpdateContentEntryDto();
    dto.title = 'Updated';

    const contentService = {
      updateEntry: jest.fn(async () => ({ id: 1, title: 'Updated' }))
    };

    const handler = new UpdateContentEntryHandler(contentService as never);
    await handler.execute(
      new UpdateContentEntryCommand('12', '34', 'actor-34', ['tenant_admin'], '56', dto, {
        requestId: 'req-2',
        correlationId: 'corr-2',
        causationId: 'cause-2'
      })
    );

    expect(contentService.updateEntry as jest.Mock).toHaveBeenCalledWith(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      '56',
      dto,
      {
        requestId: 'req-2',
        correlationId: 'corr-2',
        causationId: 'cause-2'
      }
    );
  });
});
