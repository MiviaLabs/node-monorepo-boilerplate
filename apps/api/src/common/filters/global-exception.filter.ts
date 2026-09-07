import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
  Optional
} from '@nestjs/common';
import {
  ErrorResponseData,
  ErrorResponseMetadata,
  RegisteredError,
  ResponseErrorCategory,
  ResponseErrorSeverity,
  TranslationService
} from '@package/errors';
import { Request, Response } from 'express';

import { BaseResponseDto } from '../dtos/base-response.dto';
import { ApiException } from '../errors';
import { getApiErrorDefinition } from '../errors/api-error-codes';
import { I18N_CONFIG } from '../i18n/i18n.constants';
import { getTenantContext } from '../middleware/tenant-context.storage';
import { isProduction } from '../utils/environment.util';
import { extractLocaleFromRequest } from '../utils/locale-extractor';

import type { I18nConfig } from '../../config/i18n.config';
import type { Locale } from '@package/errors';

/**
 * Legacy error codes (for backward compatibility)
 * Migrated to proper error codes from @package/errors registry
 */
const ERROR_CODES = {
  VALIDATION_FAILED: 'VAL_001',
  AUTH_UNAUTHORIZED: 'AUTH_003',
  AUTH_FORBIDDEN: 'AUTH_004',
  RESOURCE_NOT_FOUND: 'API_024',
  RESOURCE_ALREADY_EXISTS: 'DB_003',
  API_RATE_LIMIT: 'SYS_005',
  API_UNAVAILABLE: 'SYS_002'
} as const;

/**
 * Global exception filter for standardized error responses
 * Catches all exceptions and formats them consistently
 *
 * Features:
 * - Handles RegisteredError exceptions from @package/errors
 * - Automatically translates error messages via error.translated getter
 * - Falls back to legacy error codes for backward compatibility
 * - Includes tenant context in error responses
 * - Uses BaseResponseDto pattern for unified responses
 * - Logs errors with structured metadata
 *
 * Translation:
 * - Uses LocaleContext (set by LocaleContextMiddleware) for automatic locale detection
 * - No manual TranslationService.translate() calls needed
 * - error.translated.message provides the translated message
 * - error.definition.message provides the template (for non-RegisteredError errors)
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(@Optional() @Inject(I18N_CONFIG) private readonly i18nConfig: I18nConfig | null) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response = ctx.getResponse<Response>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = ctx.getRequest<Request>();

    // Determine status code and error details
    // Priority: ApiException > RegisteredError > HttpException > 500
    let status: number;
    if (exception instanceof ApiException) {
      status = exception.httpStatus;
    } else if (RegisteredError.isRegisteredError(exception)) {
      status = exception.httpStatus;
    } else if (
      exception instanceof HttpException ||
      // Handle HttpException from other package contexts (e.g., auth)
      (exception &&
        typeof exception === 'object' &&
        'getStatus' in exception &&
        typeof exception.getStatus === 'function')
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      status = (exception as { getStatus: () => number }).getStatus();
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const errorResponse = this.buildErrorResponse(exception, request);

    // Log error with context
    this.logError(exception, errorResponse, request);

    // Send response
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    response.status(status).json(errorResponse);
  }

  /**
   * Build standardized error response using BaseResponseDto<ErrorResponseData> pattern
   *
   * Handles four types of errors:
   * 1. ApiException - API-specific errors with httpStatus
   * 2. RegisteredError - Uses error.translated getter (automatic translation via LocaleContext)
   * 3. HttpException - Legacy NestJS errors
   * 4. Unknown errors - Falls back to generic error
   */
  private buildErrorResponse(
    exception: unknown,
    request: Request
  ): BaseResponseDto<ErrorResponseData> {
    const timestamp = new Date().toISOString();
    const requestId = this.getRequestId(request);

    // Handle ApiException first (before RegisteredError)
    if (exception instanceof ApiException) {
      return this.buildApiErrorResponse(exception, request, requestId, timestamp);
    }

    // Handle RegisteredError from @package/errors
    if (RegisteredError.isRegisteredError(exception)) {
      return this.buildRegisteredErrorResponse(exception, request, requestId, timestamp);
    }

    // Handle HttpException
    if (
      exception instanceof HttpException ||
      // Handle HttpException from other package contexts (e.g., auth)
      (exception &&
        typeof exception === 'object' &&
        'getStatus' in exception &&
        typeof exception.getStatus === 'function')
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const exceptionStatus = (exception as { getStatus: () => number }).getStatus();
      const code = this.mapHttpStatusToErrorCode(exceptionStatus);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const exceptionResponse = (
        exception as unknown as { getResponse: () => unknown }
      ).getResponse();
      const errors = this.extractValidationErrors(exceptionResponse as string | object);

      // For legacy errors, we still need manual translation since they're not RegisteredError
      const locale = this.getLocale(request);
      const translation = TranslationService.translate(code, {}, { locale });
      const apiErrorDefinition = code.startsWith('API_') ? getApiErrorDefinition(code) : undefined;
      const translatedMessage =
        translation.message.startsWith('Error code ') && apiErrorDefinition?.message
          ? apiErrorDefinition.message
          : translation.message;
      const message = this.extractHttpExceptionMessage(
        exceptionResponse as string | object,
        errors,
        translatedMessage
      );
      const responseCode = this.extractHttpExceptionCode(
        exceptionResponse as string | object,
        code
      );

      const errorData: ErrorResponseData = {
        code: responseCode,
        message,
        translated: message
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const errorMetadata: ErrorResponseMetadata = {
        timestamp,
        requestId,
        error: {
          category: this.mapHttpStatusToCategory(exceptionStatus),
          severity: this.mapHttpStatusToSeverity(exceptionStatus),
          httpStatus: exceptionStatus,
          debugInfo: {
            path: request.path,
            method: request.method
          },
          ...(errors.length > 0 && { errors })
        }
      };

      return BaseResponseDto.error(errorData, errorMetadata);
    }

    // Unknown error
    const locale = this.getLocale(request);
    const translation = TranslationService.translate(ERROR_CODES.API_UNAVAILABLE, {}, { locale });
    const errorData: ErrorResponseData = {
      code: ERROR_CODES.API_UNAVAILABLE,
      message: translation.message,
      translated: translation.message
    };

    const errorMetadata: ErrorResponseMetadata = {
      timestamp,
      requestId,
      error: {
        category: ResponseErrorCategory.SYSTEM,
        severity: ResponseErrorSeverity.CRITICAL,
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        debugInfo: {
          path: request.path,
          method: request.method,
          error: exception instanceof Error ? exception.message : JSON.stringify(exception)
        },
        ...(exception instanceof Error && !isProduction() && { stack: exception.stack })
      }
    };

    return BaseResponseDto.error(errorData, errorMetadata);
  }

  /**
   * Build error response for ApiException with i18n support
   *
   * ApiException is API-specific and doesn't support i18n via LocaleContext
   * because API errors are technical and should be shown as-is to developers.
   */
  private buildApiErrorResponse(
    error: ApiException,
    request: Request,
    requestId: string,
    timestamp: string
  ): BaseResponseDto<ErrorResponseData> {
    const errorData: ErrorResponseData = {
      code: error.code,
      message: error.message,
      translated: error.message,
      ...(error.parameters && { parameters: error.parameters })
    };

    const errorMetadata: ErrorResponseMetadata = {
      timestamp,
      requestId,
      error: {
        category: ResponseErrorCategory.VALIDATION,
        severity: ResponseErrorSeverity.LOW,
        httpStatus: error.httpStatus,
        debugInfo: {
          path: request.path,
          method: request.method,
          ...(isProduction() ? undefined : error.metadata)
        },
        ...(!isProduction() && error.stack && { stack: error.stack })
      }
    };

    return BaseResponseDto.error(errorData, errorMetadata);
  }

  /**
   * Build error response for RegisteredError with i18n support
   *
   * Uses error.translated getter which automatically:
   * 1. Gets locale from LocaleContext (set by LocaleContextMiddleware)
   * 2. Translates error message to the request locale
   * 3. Falls back to default locale if needed
   */
  private buildRegisteredErrorResponse(
    error: RegisteredError,
    request: Request,
    requestId: string,
    timestamp: string
  ): BaseResponseDto<ErrorResponseData> {
    // Use error.translated getter for automatic translation via LocaleContext
    const translation = error.translated;

    const errorData: ErrorResponseData = {
      code: error.code,
      // Use error.message which is the interpolated message with parameters
      // (e.g., "User with ID 123 not found" instead of "User with ID {userId} not found")
      message: error.message,
      translated: translation.message,
      ...(error.parameters && { parameters: error.parameters })
    };

    const errorMetadata: ErrorResponseMetadata = {
      timestamp,
      requestId,
      error: {
        category: error.definition.type as unknown as ResponseErrorCategory,
        severity: error.definition.severity as unknown as ResponseErrorSeverity,
        httpStatus: error.httpStatus,
        debugInfo: {
          path: request.path,
          method: request.method,
          ...(isProduction() ? {} : error.metadata)
        },
        ...(error.metadata['validationErrors'] !== undefined && {
          errors: error.metadata['validationErrors'] as string[]
        }),
        ...(!isProduction() && error.stack !== undefined && { stack: error.stack })
      }
    };

    return BaseResponseDto.error(errorData, errorMetadata);
  }

  /**
   * Get locale from request
   *
   * Priority:
   * 1. LocaleContext from LocaleContextMiddleware (preferred, automatically set)
   * 2. Fallback to extractLocaleFromRequest utility with configured default
   *
   * This ensures the locale is extracted consistently across the application.
   * The shared utility handles:
   * - Query parameter `locale`
   * - Accept-Language header with quality values
   * - Language-only fallback (e.g., "ar" from "ar-SA")
   * - Default locale fallback (from config or TranslationService)
   *
   * Note: For RegisteredError, the error.translated getter already uses
   * LocaleContext, so this method is primarily used for legacy HttpException
   * handling where LocaleContext might not be available.
   *
   * @param request - HTTP request
   * @returns Detected and validated locale code
   */
  private getLocale(request: Request): Locale {
    // Fallback to shared extraction utility with configured default
    // (LocaleContext is used directly by error.translated getter)
    const configuredDefault = this.i18nConfig?.defaultLanguage;
    return extractLocaleFromRequest(request, configuredDefault);
  }

  /**
   * Extract validation errors from response
   */
  private extractValidationErrors(response: string | object): string[] {
    if (typeof response !== 'object') {
      return [];
    }

    const obj = response as Record<string, unknown>;

    // Handle class-validator format
    const message = obj['message'];
    if (Array.isArray(message)) {
      return message as string[];
    }

    // Handle nested errors
    const errors = obj['errors'];
    if (errors && Array.isArray(errors)) {
      return errors as string[];
    }

    return [];
  }

  /**
   * Preserve explicit HttpException messages instead of always replacing them
   * with a translated legacy fallback. This keeps actionable backend failures
   * visible to clients and tests while still supporting validation arrays.
   */
  private extractHttpExceptionMessage(
    response: string | object,
    errors: string[],
    fallbackMessage: string
  ): string {
    if (typeof response === 'string' && response.trim().length > 0) {
      return response;
    }

    if (typeof response !== 'object' || response === null) {
      return errors[0] ?? fallbackMessage;
    }

    const obj = response as Record<string, unknown>;
    const message = obj['message'];

    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }

    if (Array.isArray(message)) {
      const validationMessage = message
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join('; ');

      if (validationMessage.length > 0) {
        return validationMessage;
      }
    }

    return errors[0] ?? fallbackMessage;
  }

  /**
   * Preserve explicit error codes from HttpException payloads when present.
   */
  private extractHttpExceptionCode(response: string | object, fallbackCode: string): string {
    if (typeof response !== 'object' || response === null) {
      return fallbackCode;
    }

    const code = (response as Record<string, unknown>)['code'];
    return typeof code === 'string' && code.trim().length > 0 ? code : fallbackCode;
  }

  /**
   * Map HTTP status to error code
   */
  private mapHttpStatusToErrorCode(status: number): string {
    switch (status) {
      case 400:
        return ERROR_CODES.VALIDATION_FAILED;
      case 401:
        return ERROR_CODES.AUTH_UNAUTHORIZED;
      case 403:
        return ERROR_CODES.AUTH_FORBIDDEN;
      case 404:
        return ERROR_CODES.RESOURCE_NOT_FOUND;
      case 409:
        return ERROR_CODES.RESOURCE_ALREADY_EXISTS;
      case 422:
        return ERROR_CODES.VALIDATION_FAILED;
      case 429:
        return ERROR_CODES.API_RATE_LIMIT;
      default:
        return ERROR_CODES.API_UNAVAILABLE;
    }
  }

  /**
   * Map HTTP status to error category
   */
  private mapHttpStatusToCategory(status: number): ResponseErrorCategory {
    if (status === 400 || status === 422) {
      return ResponseErrorCategory.VALIDATION;
    }
    if (status === 401 || status === 403) {
      return ResponseErrorCategory.AUTH;
    }
    if (status === 404) {
      return ResponseErrorCategory.USER;
    }
    if (status === 409) {
      return ResponseErrorCategory.BUSINESS;
    }
    if (status === 429) {
      return ResponseErrorCategory.EXTERNAL;
    }
    return ResponseErrorCategory.SYSTEM;
  }

  /**
   * Map HTTP status to error severity
   */
  private mapHttpStatusToSeverity(status: number): ResponseErrorSeverity {
    if (status < 500) {
      return ResponseErrorSeverity.LOW;
    }
    return ResponseErrorSeverity.CRITICAL;
  }

  /**
   * Get request ID from headers or generate
   */
  private getRequestId(request: Request): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const header = request.headers['x-request-id'];
    if (typeof header === 'string') {
      return header;
    }
    if (Array.isArray(header) && header[0]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return header[0];
    }
    return this.generateRequestId();
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Log error with context
   *
   * Handles four types of errors:
   * 1. ApiException - Logs with error code and metadata
   * 2. RegisteredError - Logs with error code and metadata
   * 3. HttpException - Logs with status code
   * 4. Unknown errors - Logs as unhandled exceptions
   */
  private logError(
    exception: unknown,
    errorResponse: BaseResponseDto<ErrorResponseData>,
    request: Request
  ): void {
    const tenantContext = getTenantContext();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const logContext = {
      errorCode: errorResponse.data.code,
      requestId: errorResponse.metadata?.requestId,
      path: (errorResponse.metadata?.error?.debugInfo as { path?: string })?.path,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      method: request.method,
      tenantId: tenantContext?.tenantId,
      userId: tenantContext?.userId
    };

    // Handle ApiException
    if (exception instanceof ApiException) {
      const isClientError = exception.httpStatus < 500;

      if (isClientError) {
        // Client errors - log as warning
        this.logger.warn({
          ...logContext,
          message: errorResponse.data.translated,
          parameters: exception.parameters,
          metadata: exception.metadata,
          httpStatus: exception.httpStatus
        });
      } else {
        // Server errors - log as error
        this.logger.error({
          ...logContext,
          message: errorResponse.data.translated,
          parameters: exception.parameters,
          metadata: exception.metadata,
          httpStatus: exception.httpStatus,
          stack: exception.stack
        });
      }
      return;
    }

    // Handle RegisteredError
    if (RegisteredError.isRegisteredError(exception)) {
      const isClientError = exception.httpStatus < 500;

      if (isClientError) {
        // Client errors - log as warning
        this.logger.warn({
          ...logContext,
          message: errorResponse.data.translated,
          parameters: exception.parameters,
          metadata: exception.metadata,
          httpStatus: exception.httpStatus
        });
      } else {
        // Server errors - log as error
        this.logger.error({
          ...logContext,
          message: errorResponse.data.translated,
          parameters: exception.parameters,
          metadata: exception.metadata,
          httpStatus: exception.httpStatus,
          stack: exception.stack
        });
      }
      return;
    }

    // Handle HttpException
    if (
      exception instanceof HttpException ||
      // Handle HttpException from other package contexts (e.g., auth)
      (exception &&
        typeof exception === 'object' &&
        'getStatus' in exception &&
        typeof exception.getStatus === 'function')
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const exceptionStatus = (exception as { getStatus: () => number }).getStatus();
      // Client errors - log as warning
      if (exceptionStatus < 500) {
        this.logger.warn({
          ...logContext,
          message: errorResponse.data.translated,
          errors: errorResponse.metadata?.error?.errors
        });
      } else {
        // Server errors - log as error
        this.logger.error({
          ...logContext,
          message: errorResponse.data.translated,
          stack: exception instanceof Error ? exception.stack : undefined
        });
      }
      return;
    }

    // Unknown exceptions - log as error with stack
    this.logger.error({
      ...logContext,
      message: 'Unhandled exception',
      error: exception,
      stack: exception instanceof Error ? exception.stack : undefined
    });
  }
}
