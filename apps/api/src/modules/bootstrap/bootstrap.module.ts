import { Module } from '@nestjs/common';

import { SetupController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SetupController],
  providers: [BootstrapService]
})
export class SetupModule {}
