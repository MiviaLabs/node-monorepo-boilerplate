import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EmailService } from '@package/email';

import { EmailMessageRepository, EmailProviderMessageRepository } from '../../repositories';
import { TrackedEmailService } from '../tracked-email.service';

describe('TrackedEmailService', () => {
  let service: TrackedEmailService;
  let emailService: jest.Mocked<EmailService>;
  let emailMessageRepository: jest.Mocked<EmailMessageRepository>;
  let emailProviderMessageRepository: jest.Mocked<EmailProviderMessageRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TrackedEmailService,
        {
          provide: EmailService,
          useValue: { sendEmail: jest.fn() }
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('resend') }
        },
        {
          provide: EmailMessageRepository,
          useValue: { create: jest.fn(), updateStatus: jest.fn() }
        },
        {
          provide: EmailProviderMessageRepository,
          useValue: { create: jest.fn() }
        }
      ]
    }).compile();

    service = module.get(TrackedEmailService);
    emailService = module.get(EmailService);
    emailMessageRepository = module.get(EmailMessageRepository);
    emailProviderMessageRepository = module.get(EmailProviderMessageRepository);
  });

  it('should create tracking records around a successful send', async () => {
    emailMessageRepository.create.mockResolvedValue({
      id: 15,
      publicId: 'public-123',
      organizationId: 7
    } as never);
    emailService.sendEmail.mockResolvedValue({
      messageId: 'provider-msg-1',
      success: true,
      providerResponse: { id: 'provider-msg-1' }
    });
    emailProviderMessageRepository.create.mockResolvedValue({ id: 33 } as never);
    emailMessageRepository.updateStatus.mockResolvedValue({ id: 15 } as never);

    const result = await service.sendTrackedEmail({
      organizationId: 7,
      requestId: 'req-1',
      correlationId: 'corr-1',
      causationId: 'cause-1',
      request: {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>test</p>',
        emailTracking: {
          messageKind: 'password_reset_completed',
          referenceType: 'user',
          referenceId: '42',
          correlationKey: 'password-reset:42',
          providerTags: { custom_tag: 'x' },
          safeMetadata: { flow: 'password-reset' }
        }
      }
    });

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailTracking: expect.objectContaining({
          providerTags: expect.objectContaining({
            custom_tag: 'x',
            email_message_id: 'public-123',
            email_provider_attempt: '1',
            message_kind: 'password_reset_completed',
            correlation_key: 'password-reset:42'
          })
        })
      })
    );
    expect(emailProviderMessageRepository.create).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        emailMessageId: 15,
        provider: 'resend',
        providerMessageId: 'provider-msg-1',
        attemptNumber: 1,
        normalizedStatus: 'accepted',
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      })
    );
    expect(emailMessageRepository.updateStatus).toHaveBeenCalledWith(
      7,
      15,
      'accepted',
      expect.any(Date)
    );
    expect(result).toEqual({
      response: {
        messageId: 'provider-msg-1',
        success: true,
        providerResponse: { id: 'provider-msg-1' }
      },
      emailMessageId: 15,
      emailMessagePublicId: 'public-123'
    });
  });

  it('should mark the message as failed when sendEmail throws', async () => {
    emailMessageRepository.create.mockResolvedValue({
      id: 22,
      publicId: 'public-456',
      organizationId: 9
    } as never);
    emailService.sendEmail.mockRejectedValue(new Error('send failed'));
    emailMessageRepository.updateStatus.mockResolvedValue({ id: 22 } as never);

    await expect(
      service.sendTrackedEmail({
        organizationId: 9,
        request: {
          to: 'user@example.com',
          subject: 'Failure test',
          html: '<p>test</p>'
        }
      })
    ).rejects.toThrow('send failed');

    expect(emailProviderMessageRepository.create).not.toHaveBeenCalled();
    expect(emailMessageRepository.updateStatus).toHaveBeenCalledWith(
      9,
      22,
      'failed',
      expect.any(Date)
    );
  });
});
