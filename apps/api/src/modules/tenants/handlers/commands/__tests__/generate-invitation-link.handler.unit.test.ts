import { Test } from '@nestjs/testing';

import { GenerateInvitationLinkCommand } from '../../../commands/generate-invitation-link.command';
import { TenantService } from '../../../services/tenant.service';
import { GenerateInvitationLinkHandler } from '../generate-invitation-link.handler';

import type { TestingModule } from '@nestjs/testing';

describe('GenerateInvitationLinkHandler', () => {
  let handler: GenerateInvitationLinkHandler;
  let tenantService: jest.Mocked<TenantService>;

  beforeEach(async () => {
    const mockTenantService = {
      generateInvitationLink: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerateInvitationLinkHandler,
        {
          provide: TenantService,
          useValue: mockTenantService
        }
      ]
    }).compile();

    handler = module.get<GenerateInvitationLinkHandler>(GenerateInvitationLinkHandler);
    tenantService = module.get(TenantService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should delegate invitation link generation to TenantService', async () => {
    const command = new GenerateInvitationLinkCommand({
      tenantId: '1',
      actorId: '5',
      invitationId: '42',
      requestId: 'req-123',
      correlationId: 'corr-123',
      causationId: 'cause-123'
    });
    const expected = {
      invitationId: '42',
      invitationToken: 'token-123'
    };
    tenantService.generateInvitationLink.mockResolvedValue(expected);

    const result = await handler.execute(command);

    expect(result).toEqual(expected);
    expect(tenantService.generateInvitationLink).toHaveBeenCalledWith({
      tenantId: '1',
      actorId: '5',
      requestId: 'req-123',
      correlationId: 'corr-123',
      causationId: 'cause-123',
      invitationId: '42'
    });
  });
});
