import { Module, Global } from '@nestjs/common';

import { ApiKeyRepository } from './repositories/api-key.repository';

/**
 * API Keys Module
 *
 * Provides API key management infrastructure:
 * - Repository for CRUD operations on API keys
 *
 * This module is global so ApiKeyRepository can be injected into guards
 * (such as ApiKeyGuard in common/guards) without explicit imports.
 */
@Global()
@Module({
  providers: [ApiKeyRepository],
  exports: [ApiKeyRepository]
})
export class ApiKeysModule {}
