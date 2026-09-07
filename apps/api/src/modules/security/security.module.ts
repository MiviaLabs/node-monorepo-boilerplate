import { Module } from '@nestjs/common';
import { RedisModule } from '@package/redis';

import { SecurityGuard } from './guards/security.guard';
import { SecurityMonitoringService } from './security-monitoring.service';

@Module({
  imports: [RedisModule],
  providers: [SecurityMonitoringService, SecurityGuard],
  exports: [SecurityMonitoringService, SecurityGuard]
})
export class SecurityModule {}
