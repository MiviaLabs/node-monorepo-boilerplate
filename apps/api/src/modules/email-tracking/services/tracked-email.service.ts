import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailService,
  type EmailTrackingMetadataValue,
  type IEmailTrackingRequest,
  type ISendEmailRequest,
  type ISendEmailResponse
} from '@package/email';
import { hashEmail } from '@package/utils';

import { EmailMessageRepository, EmailProviderMessageRepository } from '../repositories';

import type { IEmailMessageMetadata, IEmailProviderMessagePayload } from '@package/db-core';

type TrackingMetadata = Record<string, EmailTrackingMetadataValue>;

export interface SendTrackedEmailInput {
  organizationId: number;
  request: ISendEmailRequest;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

export interface SendTrackedEmailResult {
  response: ISendEmailResponse;
  emailMessageId: number;
  emailMessagePublicId: string;
}

@Injectable()
export class TrackedEmailService {
  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly emailProviderMessageRepository: EmailProviderMessageRepository
  ) {}

  async sendTrackedEmail(input: SendTrackedEmailInput): Promise<SendTrackedEmailResult> {
    const now = new Date();
    const normalizedTracking = input.request.emailTracking ?? {};
    const emailMessage = await this.emailMessageRepository.create(input.organizationId, {
      direction: 'outbound',
      status: 'pending',
      referenceType: normalizedTracking.referenceType,
      referenceId: normalizedTracking.referenceId,
      subject: input.request.subject,
      toEmailHash: hashRecipient(input.request.to),
      fromEmailHash: hashSender(input.request.from),
      requestId: input.requestId,
      correlationId: input.correlationId ?? normalizedTracking.correlationKey,
      causationId: input.causationId,
      metadata: buildEmailMessageMetadata(input.request, normalizedTracking),
      createdAt: now,
      updatedAt: now
    });

    const providerTags = buildProviderTags(emailMessage.publicId, normalizedTracking);
    const sendRequest: ISendEmailRequest = {
      ...input.request,
      emailTracking: {
        ...normalizedTracking,
        providerTags
      }
    };

    let response: ISendEmailResponse;
    try {
      response = await this.emailService.sendEmail(sendRequest);
    } catch (error) {
      await this.emailMessageRepository.updateStatus(
        input.organizationId,
        emailMessage.id,
        'failed',
        new Date()
      );
      throw error;
    }

    const occurredAt = new Date();
    const finalStatus = response.success ? 'accepted' : 'failed';

    await this.emailProviderMessageRepository.create(input.organizationId, {
      emailMessageId: emailMessage.id,
      provider: this.getProviderName(),
      providerMessageId: response.messageId,
      attemptNumber: 1,
      normalizedStatus: finalStatus,
      payload: buildProviderPayload(response),
      tagsJson: providerTags,
      metadataJson: buildProviderMetadata(normalizedTracking),
      requestId: input.requestId,
      correlationId: input.correlationId ?? normalizedTracking.correlationKey,
      causationId: input.causationId,
      acceptedAt: response.success ? occurredAt : undefined,
      createdAt: occurredAt,
      updatedAt: occurredAt
    });

    await this.emailMessageRepository.updateStatus(
      input.organizationId,
      emailMessage.id,
      finalStatus,
      occurredAt
    );

    if (!response.success) {
      throw new Error(response.error ?? 'Email provider returned an unsuccessful response');
    }

    return {
      response,
      emailMessageId: emailMessage.id,
      emailMessagePublicId: emailMessage.publicId
    };
  }

  private getProviderName(): string {
    return (this.configService.get<string>('EMAIL_PROVIDER') ?? 'mock').trim().toLowerCase();
  }
}

function hashRecipient(to: string | string[]): string | undefined {
  return hashSingleEmail(Array.isArray(to) ? (to.length === 1 ? to[0] : undefined) : to);
}

function hashSender(from?: string): string | undefined {
  return hashSingleEmail(from);
}

function hashSingleEmail(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized?.includes('@') ? hashEmail(normalized) : undefined;
}

function buildProviderTags(
  emailMessagePublicId: string,
  emailTracking: IEmailTrackingRequest
): Record<string, string> {
  return {
    ...(emailTracking.providerTags ?? {}),
    email_message_id: emailMessagePublicId,
    email_provider_attempt: '1',
    ...(emailTracking.messageKind ? { message_kind: emailTracking.messageKind } : {}),
    ...(emailTracking.correlationKey ? { correlation_key: emailTracking.correlationKey } : {})
  };
}

function buildEmailMessageMetadata(
  request: ISendEmailRequest,
  emailTracking: IEmailTrackingRequest
): IEmailMessageMetadata {
  return {
    tags: request.tags,
    headers: request.headers,
    providerHints: {
      providerTags: emailTracking.providerTags,
      safeMetadata: emailTracking.safeMetadata
    },
    ...(emailTracking.messageKind ? { messageKind: emailTracking.messageKind } : {}),
    ...(emailTracking.correlationKey ? { correlationKey: emailTracking.correlationKey } : {})
  };
}

function buildProviderMetadata(emailTracking: IEmailTrackingRequest): TrackingMetadata {
  return {
    ...(emailTracking.messageKind ? { messageKind: emailTracking.messageKind } : {}),
    ...(emailTracking.referenceType ? { referenceType: emailTracking.referenceType } : {}),
    ...(emailTracking.referenceId ? { referenceId: emailTracking.referenceId } : {}),
    ...(emailTracking.correlationKey ? { correlationKey: emailTracking.correlationKey } : {}),
    ...(emailTracking.safeMetadata ?? {})
  };
}

function buildProviderPayload(response: ISendEmailResponse): IEmailProviderMessagePayload {
  const payload: IEmailProviderMessagePayload = {};

  if (isRecord(response.providerResponse)) {
    payload.response = response.providerResponse;
  }

  if (response.error) {
    payload.metadata = { error: response.error };
  }

  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
