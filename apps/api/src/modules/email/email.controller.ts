/**
 * Email Controller (Example Integration)
 *
 * This controller demonstrates how to use the EmailService from @package/email
 * in a NestJS application. It provides example endpoints for sending emails.
 *
 * @packageDocumentation
 */

import { Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiExtraModels,
  ApiCreatedResponse
} from '@nestjs/swagger';
import { EmailService } from '@package/email';
import { Action, Resource } from '@package/opa';

import { SendEmailDto, SendBatchEmailsDto, SendEmailResponseDto } from './dto/send-email.dto';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { TenantContext } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

/**
 * Email Controller
 *
 * Example controller demonstrating EmailService integration with:
 * - Versioned routing via @VersionedController
 * - JWT authentication via @ApiBearerAuth
 * - Tenant context extraction via @TenantContext()
 * - P0 compliance: No PII logged in controller methods
 *
 * P0 Compliance: This controller does NOT log PII (email addresses, message content).
 * All logging uses non-PII identifiers (message IDs, counts, status codes).
 *
 * @example Send a single email
 * POST /api/v1/email/send
 * {
 *   "to": "user@example.com",
 *   "subject": "Welcome!",
 *   "html": "<h1>Welcome!</h1>"
 * }
 *
 * @example Send batch emails
 * POST /api/v1/email/batch
 * {
 *   "emails": [
 *     { "to": "user1@example.com", "subject": "Hello 1", "html": "<p>Hi 1</p>" },
 *     { "to": "user2@example.com", "subject": "Hello 2", "html": "<p>Hi 2</p>" }
 *   ]
 * }
 */
@ApiTags('email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
@ApiExtraModels(SendEmailResponseDto)
@VersionedController('v1', 'messaging')
export class MessagingController {
  /**
   * Creates a new MessagingController instance.
   *
   * @param emailService - Injected EmailService from @package/email
   */
  constructor(private readonly emailService: EmailService) {}

  /**
   * Send a single email.
   *
   * Endpoint for sending a single email using the configured email provider.
   *
   * P0 Compliance: Does NOT log email addresses or message content.
   * Logs only message ID for tracing.
   *
   * @param _tenant - Tenant context (not used in this example, but demonstrates extraction)
   * @param dto - Email send request
   * @returns Promise resolving to send response with message ID
   *
   * @example
   * ```bash
   * curl -X POST http://localhost:3000/api/v1/email/send \
   *   -H "Authorization: Bearer YOUR_TOKEN" \
   *   -H "Content-Type: application/json" \
   *   -d '{
   *     "to": "user@example.com",
   *     "subject": "Welcome!",
   *     "html": "<h1>Welcome!</h1>"
   *   }'
   * ```
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a single email',
    description:
      'Sends a single email using the configured email provider. Returns the message ID on success.'
  })
  @Resource({ type: OPA_RESOURCES.EMAILS, scope: 'tenant' })
  @Action(OPA_ACTIONS.SEND)
  @ApiCreatedResponse({
    description: 'Email sent successfully',
    type: SendEmailResponseDto
  })
  async sendEmail(
    @TenantContext() _tenant: unknown,
    @Body() dto: SendEmailDto
  ): Promise<SendEmailResponseDto> {
    // P0: Do NOT log email addresses or message content
    const response = await this.emailService.sendEmail({
      to: dto.to,
      subject: dto.subject,
      html: dto.html,
      text: dto.text,
      from: dto.from
    });

    // Note: In production, use a proper logger (e.g., this.logger.log())
    // For this example, we skip logging to avoid console.log warnings

    return {
      messageId: response.messageId,
      success: response.success as boolean,
      provider: 'email' // Default provider name
    };
  }

  /**
   * Send multiple emails in batch.
   *
   * Endpoint for sending multiple emails in a single request using the
   * configured email provider.
   *
   * P0 Compliance: Does NOT log email addresses or message content.
   * Logs only request count and status codes for tracking.
   *
   * @param _tenant - Tenant context (not used in this example, but demonstrates extraction)
   * @param dto - Batch email send request
   * @returns Promise resolving to array of send responses
   *
   * @example
   * ```bash
   * curl -X POST http://localhost:3000/api/v1/email/batch \
   *   -H "Authorization: Bearer YOUR_TOKEN" \
   *   -H "Content-Type: application/json" \
   *   -d '{
   *     "emails": [
   *       { "to": "user1@example.com", "subject": "Hello 1", "html": "<p>Hi 1</p>" },
   *       { "to": "user2@example.com", "subject": "Hello 2", "html": "<p>Hi 2</p>" }
   *     ]
   *   }'
   * ```
   */
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send multiple emails in batch',
    description:
      'Sends multiple emails in a single request. Returns an array of message IDs on success.'
  })
  @Resource({ type: OPA_RESOURCES.EMAILS, scope: 'tenant' })
  @Action(OPA_ACTIONS.BATCH_SEND)
  @ApiCreatedResponse({
    description: 'Batch email sent successfully',
    type: [SendEmailResponseDto]
  })
  async sendBatch(
    @TenantContext() _tenant: unknown,
    @Body() dto: SendBatchEmailsDto
  ): Promise<SendEmailResponseDto[]> {
    // P0: Do NOT log email addresses or message content
    const requests = dto.emails.map((emailDto) => ({
      to: emailDto.to,
      subject: emailDto.subject,
      html: emailDto.html,
      text: emailDto.text,
      from: emailDto.from
    }));

    const responses = await this.emailService.sendBatch(requests);

    // Note: In production, use a proper logger (e.g., this.logger.log())
    // For this example, we skip logging to avoid console.log warnings

    return responses.map((response) => ({
      messageId: response.messageId,
      success: response.success as boolean,
      provider: 'email' // Default provider name
    }));
  }

  /**
   * Health check for email service.
   *
   * Endpoint to check if the email provider is healthy and can send emails.
   *
   * @returns Promise resolving to true if healthy, false otherwise
   *
   * @example
   * ```bash
   * curl -X GET http://localhost:3000/api/v1/email/health \
   *   -H "Authorization: Bearer YOUR_TOKEN"
   * ```
   */
  @Post('ops/health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email provider health check',
    description: 'Checks if the email provider is healthy and can send emails.'
  })
  @Resource({ type: OPA_RESOURCES.EMAILS, scope: 'tenant' })
  @Action(OPA_ACTIONS.HEALTH_CHECK)
  @ApiCreatedResponse({
    description: 'Health check result',
    schema: {
      type: 'object',
      properties: {
        healthy: { type: 'boolean', example: true }
      }
    }
  })
  async healthCheck(): Promise<{ healthy: boolean }> {
    const isHealthy = await this.emailService.healthCheck();
    return { healthy: isHealthy };
  }
}
