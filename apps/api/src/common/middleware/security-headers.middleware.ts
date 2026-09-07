import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware for production-ready API security.
 *
 * Adds security-related HTTP headers to all responses:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 1; mode=block
 * - Strict-Transport-Security: HSTS configuration
 * - Content-Security-Policy: CSP configuration
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: restricts browser features
 *
 * Configuration via environment variables:
 * - SECURITY_HEADERS_ENABLED: Enable/disable (default: true)
 * - SECURITY_HSTS_ENABLED: Enable HSTS (default: true in production)
 * - SECURITY_HSTS_MAX_AGE: HSTS max-age in seconds (default: 31536000 = 1 year)
 * - SECURITY_HSTS_INCLUDE_SUBDOMAINS: Include subdomains in HSTS (default: true)
 * - SECURITY_HSTS_PRELOAD: Enable HSTS preload (default: false)
 * - SECURITY_CSP_ENABLED: Enable CSP (default: true)
 * - SECURITY_CSP_DEFAULT_SRC: Default CSP source (default: "'self'")
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const enabled = this.configService.get<boolean>('securityHeaders.enabled', true);

    if (!enabled) {
      next();
      return;
    }

    // Basic security headers (always applied when enabled)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions-Policy (formerly Feature-Policy)
    // Restricts browser features for improved security and privacy
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()'
    );

    // HTTP Strict Transport Security (HSTS)
    // Only apply in production with HTTPS
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const hstsEnabled = this.configService.get<boolean>(
      'securityHeaders.hsts.enabled',
      isProduction
    );

    if (hstsEnabled && isProduction && req.secure) {
      const maxAge = this.configService.get<number>(
        'securityHeaders.hsts.maxAge',
        31536000 // 1 year in seconds
      );
      const includeSubDomains = this.configService.get<boolean>(
        'securityHeaders.hsts.includeSubDomains',
        true
      );
      const preload = this.configService.get<boolean>('securityHeaders.hsts.preload', false);

      let hstsValue = `max-age=${maxAge}`;
      if (includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (preload) {
        hstsValue += '; preload';
      }

      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // Content Security Policy (CSP)
    const cspEnabled = this.configService.get<boolean>('securityHeaders.csp.enabled', true);

    if (cspEnabled) {
      // SEC-006: Remove 'unsafe-inline' and 'unsafe-eval' from default sources
      const defaultSrc = this.configService.get<string>('securityHeaders.csp.defaultSrc', "'self'");
      const scriptSrc = this.configService.get<string>(
        'securityHeaders.csp.scriptSrc',
        // Default to 'self' (no 'unsafe-inline' or 'unsafe-eval')
        "'self'"
      );
      const styleSrc = this.configService.get<string>(
        'securityHeaders.csp.styleSrc',
        // Default to 'self' (no 'unsafe-inline')
        "'self'"
      );
      const imgSrc = this.configService.get<string>(
        'securityHeaders.csp.imgSrc',
        "'self' data: https:"
      );
      const connectSrc = this.configService.get<string>('securityHeaders.csp.connectSrc', "'self'");
      const fontSrc = this.configService.get<string>('securityHeaders.csp.fontSrc', "'self'");
      const objectSrc = this.configService.get<string>('securityHeaders.csp.objectSrc', "'none'");
      const mediaSrc = this.configService.get<string>('securityHeaders.csp.mediaSrc', "'self'");
      const frameSrc = this.configService.get<string>('securityHeaders.csp.frameSrc', "'none'");

      const cspValue = [
        `default-src ${defaultSrc}`,
        `script-src ${scriptSrc}`,
        `style-src ${styleSrc}`,
        `img-src ${imgSrc}`,
        `connect-src ${connectSrc}`,
        `font-src ${fontSrc}`,
        `object-src ${objectSrc}`,
        `media-src ${mediaSrc}`,
        `frame-src ${frameSrc}`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `frame-ancestors 'none'`,
        `upgrade-insecure-requests`
      ].join('; ');

      res.setHeader('Content-Security-Policy', cspValue);
    }

    // Remove X-Powered-By header (information disclosure)
    res.removeHeader('X-Powered-By');

    next();
  }
}
