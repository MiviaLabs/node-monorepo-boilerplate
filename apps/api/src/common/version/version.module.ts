import { Global, Module } from '@nestjs/common';

import { VersionService } from '../services/version.service';

/**
 * VersionModule provides centralized API version management
 *
 * This module is @Global() meaning it's available throughout the application
 * without needing to be imported in other modules.
 */
@Global()
@Module({
  providers: [VersionService],
  exports: [VersionService]
})
export class VersionModule {}
