import { describe, expect, it, jest } from '@jest/globals';

import { DeleteContentEntryCommand } from '../../../commands/delete-content-entry.command';
import { DeleteContentEntryHandler } from '../delete-content-entry.handler';

describe('DeleteContentEntryHandler', () => {
  it('delegates deletion to the content service with actor context', async () => {
    const contentService = {
      deleteEntry: jest.fn(async () => undefined)
    };

    const handler = new DeleteContentEntryHandler(contentService as never);
    await handler.execute(
      new DeleteContentEntryCommand('12', '34', 'actor-34', ['tenant_admin'], '56', {
        requestId: 'req-3',
        correlationId: 'corr-3',
        causationId: 'cause-3'
      })
    );

    expect(contentService.deleteEntry as jest.Mock).toHaveBeenCalledWith(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      '56',
      {
        requestId: 'req-3',
        correlationId: 'corr-3',
        causationId: 'cause-3'
      }
    );
  });
});
