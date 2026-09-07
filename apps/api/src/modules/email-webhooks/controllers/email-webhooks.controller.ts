import { BadRequestException, Body, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { IngestEmailWebhookEventCommand } from '../commands';
import { IngestEmailWebhookEventResultDto } from '../dto/ingest-email-webhook-event-result.dto';

import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { IEmailWebhookHeaders } from '@package/db-core';
import type { Request } from 'express';

import { RequestTraceData } from '@/common/decorators';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { Public } from '@/modules/auth/guards';

type WebhookRequest = Request & {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
};

@ApiTags('inbound-mail')
@VersionedController('v1', 'webhooks/inbound-mail')
export class InboundMailController {
  constructor(private readonly commandBus: CommandBus) {}

  @Public()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive inbound email provider webhooks',
    description: 'Public webhook endpoint for email provider event ingestion.'
  })
  @ApiResponse({ status: 200, type: IngestEmailWebhookEventResultDto })
  async ingestWebhook(
    @Param('provider') provider: string,
    @Req() req: WebhookRequest,
    @Body() body: unknown,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<IngestEmailWebhookEventResultDto> {
    if (!req.rawBody || req.rawBody.length === 0) {
      throw new BadRequestException('Raw request body is required for email webhook verification');
    }

    return this.commandBus.execute<
      IngestEmailWebhookEventCommand,
      IngestEmailWebhookEventResultDto
    >(
      new IngestEmailWebhookEventCommand({
        provider,
        rawBody: req.rawBody,
        body,
        headers: req.headers as IEmailWebhookHeaders,
        contentType: this.getContentType(req.headers),
        requestId: trace.requestId,
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );
  }

  private getContentType(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const contentType = headers['content-type'];
    return Array.isArray(contentType) ? contentType[0] : contentType;
  }
}
