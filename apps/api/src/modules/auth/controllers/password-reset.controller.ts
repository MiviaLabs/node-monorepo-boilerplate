import { Body, Get, Post, Query, BadRequestException, HttpCode } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { RequestPasswordResetCommand } from '../commands/request-password-reset.command';
import { ResetPasswordCommand } from '../commands/reset-password.command';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ValidateTokenResponseDto } from '../dto/validate-token-response.dto';
import { Public } from '../guards/public.decorator';
import { ValidatePasswordResetTokenQuery } from '../queries/validate-password-reset-token.query';

import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { RequestTraceData, VersionedController } from '@/common/decorators';

/**
 * Password Reset Controller
 *
 * Handles public password reset operations without authentication.
 * All endpoints are rate-limited to prevent abuse.
 *
 * Endpoints:
 * - POST /auth/password-reset/request - Request password reset
 * - POST /auth/password-reset/reset - Complete password reset
 * - GET /auth/password-reset/validate - Validate reset token
 */
@ApiTags('auth')
@VersionedController('v1', 'iam/credentials')
export class CredentialRecoveryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  /**
   * Request password reset
   *
   * Initiates a password reset request by sending a reset link to the user's email.
   * Rate limited to 3 requests per 15 minutes to prevent abuse.
   */
  @Public()
  @Throttle({ passwordReset: {} })
  @Post('request')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      "Initiates a password reset by sending a reset link to the email address if it exists. Only email is required - the system automatically determines the user's organization. Always returns success to prevent email enumeration."
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset request processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'If the email exists, a reset link has been sent'
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request payload'
  })
  @ApiResponse({
    status: 429,
    description: 'Too many password reset requests - rate limit exceeded'
  })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<{ success: boolean; message: string }> {
    const command = new RequestPasswordResetCommand({
      tenantId: 'public',
      email: dto.email,
      ...toCqrsTrace(trace)
    });

    await this.commandBus.execute(command);

    // Generic success message to prevent email enumeration
    return {
      success: true,
      message: 'If the email exists, a reset link has been sent'
    };
  }

  /**
   * Complete password reset
   *
   * Validates the reset token and updates the user's password.
   * Rate limited to 5 requests per 15 minutes.
   */
  @Public()
  @Throttle({ passwordReset: {} })
  @Post('reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete password reset',
    description: 'Validates the reset token and updates the user password to the new value provided'
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Password reset successfully' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or password validation failed'
  })
  @ApiResponse({
    status: 404,
    description: 'Reset token not found or already used'
  })
  @ApiResponse({
    status: 429,
    description: 'Too many password reset attempts - rate limit exceeded'
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<{ success: boolean; message: string }> {
    const command = new ResetPasswordCommand({
      tenantId: 'public',
      token: dto.token,
      newPassword: dto.newPassword,
      ...toCqrsTrace(trace)
    });

    return this.commandBus.execute<ResetPasswordCommand, { success: boolean; message: string }>(
      command
    );
  }

  /**
   * Validate password reset token
   *
   * Checks if a password reset token is valid and can be used.
   * Rate limited to 10 requests per minute.
   */
  @Public()
  @Throttle({ validateToken: {} })
  @Get('validate')
  @ApiOperation({
    summary: 'Validate password reset token',
    description:
      'Checks if a password reset token is valid, expired, used, or not found. Use this before showing password reset form.'
  })
  @ApiQuery({
    name: 'token',
    description: 'Password reset token to validate',
    required: true,
    example: '2f20ea8d-45c3-44f7-a59d-5fcf85fd1f17'
  })
  @ApiResponse({
    status: 200,
    description: 'Token validation result',
    type: ValidateTokenResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Missing or invalid token parameter'
  })
  @ApiResponse({
    status: 429,
    description: 'Too many validation requests - rate limit exceeded'
  })
  async validateToken(
    @Query('token') token: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<ValidateTokenResponseDto> {
    if (!token) {
      throw new BadRequestException('Token parameter is required');
    }

    const query = new ValidatePasswordResetTokenQuery({
      token,
      ...toCqrsTrace(trace)
    });

    return this.queryBus.execute<ValidatePasswordResetTokenQuery, ValidateTokenResponseDto>(query);
  }
}
