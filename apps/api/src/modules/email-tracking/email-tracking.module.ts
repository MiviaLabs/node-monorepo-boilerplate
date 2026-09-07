import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EmailMessageRepository, EmailProviderMessageRepository } from './repositories';
import { EmailModule } from '../email/email.module';
import { TrackedEmailService } from './services/tracked-email.service';

@Module({
  imports: [ConfigModule, forwardRef(() => EmailModule)],
  providers: [EmailMessageRepository, EmailProviderMessageRepository, TrackedEmailService],
  exports: [TrackedEmailService, EmailMessageRepository, EmailProviderMessageRepository]
})
export class EmailTrackingModule {}
