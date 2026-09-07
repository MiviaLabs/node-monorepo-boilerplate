import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM,
  EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM,
  type EmailWebhookVerificationStatus,
  type EmailWebhookProcessingStatus
} from '@package/db-core';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface
} from 'class-validator';

@ValidatorConstraint({ name: 'DateRangeConstraint', async: false })
class DateRangeConstraint implements ValidatorConstraintInterface {
  validate(dateTo: string | undefined, validationArguments: ValidationArguments): boolean {
    const dto = validationArguments.object as QueryEmailWebhookEventsDto;
    if (!dto.dateFrom || !dateTo) {
      return true;
    }

    return new Date(dto.dateFrom).getTime() <= new Date(dateTo).getTime();
  }

  defaultMessage(): string {
    return 'dateTo must be greater than or equal to dateFrom';
  }
}

export class QueryEmailWebhookEventsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'resend' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ example: 77 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  organizationId?: number;

  @ApiPropertyOptional({ enum: EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM, example: 'failed' })
  @IsOptional()
  @IsEnum(EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM)
  processingStatus?: EmailWebhookProcessingStatus;

  @ApiPropertyOptional({ enum: EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM, example: 'verified' })
  @IsOptional()
  @IsEnum(EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM)
  verificationStatus?: EmailWebhookVerificationStatus;

  @ApiPropertyOptional({ example: 'delivered' })
  @IsOptional()
  @IsString()
  normalizedEventType?: string;

  @ApiPropertyOptional({ example: 'email.delivered' })
  @IsOptional()
  @IsString()
  providerEventType?: string;

  @ApiPropertyOptional({ example: 'msg_123' })
  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @ApiPropertyOptional({ example: 'delivery_123' })
  @IsOptional()
  @IsString()
  providerDeliveryId?: string;

  @ApiPropertyOptional({ example: 'event_123' })
  @IsOptional()
  @IsString()
  providerEventId?: string;

  @ApiPropertyOptional({ example: 55 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  emailMessageId?: number;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-03-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  @Validate(DateRangeConstraint)
  dateTo?: string;
}
