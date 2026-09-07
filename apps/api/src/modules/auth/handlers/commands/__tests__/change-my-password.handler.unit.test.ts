import { Test } from '@nestjs/testing';

import { ChangeMyPasswordCommand } from '../../../commands/change-my-password.command';
import { AuthService } from '../../../services/auth.service';
import { ChangeMyPasswordHandler } from '../change-my-password.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('ChangeMyPasswordHandler', () => {
  let handler: ChangeMyPasswordHandler;
  let authService: jest.Mocked<AuthService>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeMyPasswordHandler,
        {
          provide: AuthService,
          useValue: {
            changeMyPassword: jest.fn()
          }
        },
        {
          provide: AuditOutboxPublisher,
          useValue: {
            insert: jest.fn()
          }
        },
        {
          provide: MAIN_DB,
          useValue: {}
        }
      ]
    }).compile();

    handler = module.get(ChangeMyPasswordHandler);
    authService = module.get(AuthService);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call authService with normalized password values', async () => {
    const command = new ChangeMyPasswordCommand({
      tenantId: '1',
      userId: '101',
      actorId: '101',
      email: 'user@example.com',
      currentPassword: '  OldPass123!  ',
      newPassword: '  NewPass123!  '
    });

    await handler.execute(command);

    expect(authService.changeMyPassword).toHaveBeenCalledWith(
      '1',
      101,
      'user@example.com',
      'OldPass123!',
      'NewPass123!'
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'auth.password.changed.audit',
        payload: expect.objectContaining({
          action: 'CHANGE_PASSWORD',
          target: expect.objectContaining({
            entityType: 'user',
            entityId: '101'
          })
        })
      })
    );
  });
});
