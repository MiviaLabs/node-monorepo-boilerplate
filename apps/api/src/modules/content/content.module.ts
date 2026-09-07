import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PagesController } from './controllers';
import {
  CreateContentAttachmentHandler,
  CreateContentCommentHandler,
  CreateContentEntryHandler,
  DeleteContentCommentHandler,
  DeleteContentEntryHandler,
  UpdateContentEntryHandler
} from './handlers';
import {
  ContentAttachmentRepository,
  ContentCommentRepository,
  ContentRepository
} from './repositories';
import { ContentService } from './services';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SpacesModule } from '../projects/projects.module';
import { StorageModule } from '../storage/storage.module';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@Module({
  imports: [CqrsModule, DatabaseModule, AuthModule, SpacesModule, StorageModule],
  controllers: [PagesController],
  providers: [
    AuditOutboxPublisher,
    ContentAttachmentRepository,
    ContentCommentRepository,
    ContentRepository,
    ContentService,
    CreateContentAttachmentHandler,
    CreateContentCommentHandler,
    CreateContentEntryHandler,
    DeleteContentCommentHandler,
    UpdateContentEntryHandler,
    DeleteContentEntryHandler
  ],
  exports: [ContentRepository, ContentService]
})
export class PagesModule {}
