/**
 * Locale Context Middleware
 *
 * Extracts locale from HTTP requests and stores it in AsyncLocalStorage
 * for automatic translation in error handling.
 *
 * This middleware uses the same extraction logic as ErrorI18nModule
 * to ensure consistency across the application.
 */

import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocaleContext, type Locale } from '@package/errors';

import { extractLocaleFromRequest } from '../utils/locale-extractor';

import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware to extract locale from request and store it in LocaleContext
 *
 * This enables automatic translation via the error.translated getter
 * without requiring manual locale passing.
 *
 * Priority:
 * 1. Query parameter `locale` (e.g., ?locale=ar-SA)
 * 2. Accept-Language header (e.g., "ar-SA,en-US;q=0.9")
 * 3. Default locale (from config or TranslationService)
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * import { RequestMethod } from '@nestjs/common';
 *
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(LocaleContextMiddleware).forRoutes({ path: '/*', method: RequestMethod.ALL });
 *   }
 * }
 * ```
 */
@Injectable()
export class LocaleContextMiddleware implements NestMiddleware {
  constructor(@Optional() private readonly configService: ConfigService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    // Extract locale using the same logic as ErrorI18nModule
    // Use optional chaining in case ConfigService is not available (e.g., in tests)
    const configuredDefault = this.configService?.get<string>('API_DEFAULT_LANGUAGE');
    const locale = extractLocaleFromRequest(req, configuredDefault as Locale);

    // Run the request with locale context
    LocaleContext.run(locale, next);
  }
}
