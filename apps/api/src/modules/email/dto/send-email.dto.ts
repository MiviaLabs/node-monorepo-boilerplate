/**
 * Send Email DTO
 *
 * Data transfer object for sending a single email via the email service.
 *
 * @packageDocumentation
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request DTO for sending a single email.
 */
export class SendEmailDto {
  /**
   * Recipient email address.
   *
   * @example 'user@example.com'
   */
  @ApiProperty({
    description: 'Recipient email address',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  to!: string;

  /**
   * Email subject line.
   *
   * @example 'Welcome to our service'
   */
  @ApiProperty({
    description: 'Email subject line',
    example: 'Welcome to our service'
  })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  /**
   * HTML content of the email.
   *
   * @example '<h1>Welcome!</h1><p>Thanks for signing up.</p>'
   */
  @ApiProperty({
    description: 'HTML content of the email',
    example: '<h1>Welcome!</h1><p>Thanks for signing up.</p>'
  })
  @IsString()
  @IsNotEmpty()
  html!: string;

  /**
   * Plain text content of the email (optional).
   *
   * @example 'Welcome! Thanks for signing up.'
   */
  @ApiPropertyOptional({
    description: 'Plain text content of the email',
    example: 'Welcome! Thanks for signing up.'
  })
  @IsString()
  @IsOptional()
  text?: string;

  /**
   * Sender email address (optional, uses default if not provided).
   *
   * @example 'noreply@yourdomain.com'
   */
  @ApiPropertyOptional({
    description: 'Sender email address (uses default if not provided)',
    example: 'noreply@yourdomain.com'
  })
  @IsEmail()
  @IsOptional()
  from?: string;
}

/**
 * Batch Email Send DTO
 *
 * Data transfer object for sending multiple emails in a single request.
 */
export class SendBatchEmailsDto {
  /**
   * Array of email send requests.
   */
  @ApiProperty({
    description: 'Array of email send requests',
    type: [SendEmailDto]
  })
  @IsNotEmpty()
  emails!: SendEmailDto[];
}

/**
 * Send Email Response DTO
 *
 * Response DTO for successful email send operations.
 */
export class SendEmailResponseDto {
  /**
   * Message ID from the email provider.
   *
   * @example 'msg-1234567890'
   */
  @ApiProperty({
    description: 'Message ID from the email provider',
    example: 'msg-1234567890'
  })
  messageId!: string;

  /**
   * Success flag.
   *
   * @example true
   */
  @ApiProperty({
    description: 'Success flag',
    example: true
  })
  success!: boolean;

  /**
   * Provider name.
   *
   * @example 'resend'
   */
  @ApiProperty({
    description: 'Provider name',
    example: 'resend'
  })
  provider!: string;
}
