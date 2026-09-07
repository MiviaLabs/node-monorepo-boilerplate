import { createHash } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { API_KEY_PUBLIC_KEY } from '../decorators/api-key-public.decorator';
import { ApiException } from '../errors';
import { getTenantContext } from '../middleware/tenant-context.storage';

import type { Request } from 'express';

import { ApiKeyRepository } from '@/modules/api-keys/repositories/api-key.repository';

/**
 * Hash an API key using SHA-256.
 * This matches the storage format in the database.
 */
function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * API key authentication guard.
 * Validates API keys from request headers or query parameters against the database.
 *
 * API keys are extracted from:
 * 1. Header: X-API-Key
 * 2. Header: Authorization: Bearer {apiKey}
 * 3. Query parameter: apiKey
 *
 * Validation includes:
 * - Database lookup by key hash
 * - Tenant scoping (key must belong to current tenant)
 * - Active status check
 * - Expiration check
 * - Last used tracking
 *
 * Usage:
 * @UseGuards(ApiKeyGuard)
 * @Controller('products')
 * export class ProductsController {}
 *
 * Public endpoints (skip API key check):
 * @ApiKeyPublic()
 * @Get('health')
 * health() {}
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyRepository: ApiKeyRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint is marked as public
    const isPublic = this.reflector.get<boolean>(API_KEY_PUBLIC_KEY, context.getHandler());

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      this.logger.warn('API key missing from request');
      throw ApiException.invalidApiKey();
    }

    // Get tenant context (set by TenantMiddleware)
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) {
      this.logger.warn('Tenant context not available for API key validation');
      throw ApiException.tenantContextMissing();
    }

    const tenantId = tenantContext.tenantId;

    // Hash the incoming API key for lookup
    const keyHash = hashApiKey(apiKey);

    // Look up the API key in the database
    const apiKeyRecord = await this.apiKeyRepository.findByKeyHash(tenantId, keyHash);

    if (!apiKeyRecord) {
      this.logger.warn(`Invalid API key attempted for tenant ${tenantId}`);
      throw ApiException.invalidApiKey();
    }

    // Check if the key is expired
    if (this.apiKeyRepository.isExpired(apiKeyRecord)) {
      this.logger.warn(`Expired API key ${apiKeyRecord.id} used for tenant ${tenantId}`);
      throw ApiException.apiKeyExpired(
        apiKeyRecord.keyPrefix,
        apiKeyRecord.expiresAt?.toISOString()
      );
    }

    // Update last used timestamp (fire and forget - don't block the request)
    const clientIp = this.extractClientIp(request);
    this.apiKeyRepository.updateLastUsed(tenantId, apiKeyRecord.id, clientIp).catch((error) => {
      this.logger.error(`Failed to update last used for API key ${apiKeyRecord.id}:`, error);
    });

    // Attach API key info to request for use in handlers
    (request as unknown as Record<string, unknown>)['apiKey'] = {
      id: apiKeyRecord.id,
      name: apiKeyRecord.name,
      scopes: apiKeyRecord.scopes ?? [],
      userId: apiKeyRecord.userId,
      organizationId: apiKeyRecord.organizationId
    };

    this.logger.debug(`API key ${apiKeyRecord.keyPrefix}... validated for tenant ${tenantId}`);

    return true;
  }

  /**
   * Extract API key from various sources.
   * Priority: Authorization header > X-API-Key header > Query parameter
   */
  private extractApiKey(request: Request): string | null {
    // Check Authorization header: Bearer {apiKey}
    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const apiKeyHeader = request.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
      return apiKeyHeader;
    }

    // Check query parameter
    const apiKeyQuery = request.query['apiKey'] as string | undefined;
    if (typeof apiKeyQuery === 'string' && apiKeyQuery.length > 0) {
      return apiKeyQuery;
    }

    return null;
  }

  /**
   * Extract client IP address from request.
   * Handles proxied requests with X-Forwarded-For header.
   */
  private extractClientIp(request: Request): string | undefined {
    // Check X-Forwarded-For header (when behind proxy/load balancer)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      // X-Forwarded-For can contain multiple IPs, take the first one (client)
      return forwardedFor.split(',')[0]?.trim();
    }

    // Check X-Real-IP header (nginx)
    const realIp = request.headers['x-real-ip'];
    if (typeof realIp === 'string') {
      return realIp;
    }

    // Fall back to socket address
    return request.socket?.remoteAddress;
  }
}
