import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { TicketsController } from './controllers';
import {
  AddIssueAssigneeHandler,
  AddIssueLabelHandler,
  AddIssueWatcherHandler,
  CreateIssueAttachmentHandler,
  CreateIssueAttachmentUploadHandler,
  CreateIssueLabelHandler,
  CreateIssueCommentHandler,
  CreateIssueHandler,
  CreateIssueRelationHandler,
  DeleteIssueAttachmentHandler,
  DeleteIssueLabelHandler,
  DeleteIssueHandler,
  DeleteIssueRelationHandler,
  RemoveIssueAssigneeHandler,
  RemoveIssueLabelHandler,
  RemoveIssueWatcherHandler,
  UpdateIssueLabelHandler,
  UpdateIssueHandler
} from './handlers';
import {
  IssueActivityRepository,
  IssueAttachmentRepository,
  IssueAssigneeRepository,
  IssueCommentRepository,
  IssueLabelRepository,
  IssueRelationRepository,
  IssueRepository,
  IssueWatcherRepository
} from './repositories';
import { IssuesService } from './services';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SpacesModule } from '../projects/projects.module';
import { StorageModule } from '../storage/storage.module';
import { WorkspacesModule } from '../tenants/tenants.module';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@Module({
  imports: [CqrsModule, DatabaseModule, AuthModule, SpacesModule, StorageModule, WorkspacesModule],
  controllers: [TicketsController],
  providers: [
    AuditOutboxPublisher,
    IssueRepository,
    IssueAttachmentRepository,
    IssueAssigneeRepository,
    IssueLabelRepository,
    IssueCommentRepository,
    IssueWatcherRepository,
    IssueRelationRepository,
    IssueActivityRepository,
    IssuesService,
    CreateIssueAttachmentHandler,
    CreateIssueAttachmentUploadHandler,
    AddIssueAssigneeHandler,
    AddIssueLabelHandler,
    RemoveIssueAssigneeHandler,
    AddIssueWatcherHandler,
    RemoveIssueWatcherHandler,
    CreateIssueLabelHandler,
    UpdateIssueLabelHandler,
    DeleteIssueLabelHandler,
    RemoveIssueLabelHandler,
    CreateIssueCommentHandler,
    CreateIssueHandler,
    CreateIssueRelationHandler,
    UpdateIssueHandler,
    DeleteIssueHandler,
    DeleteIssueAttachmentHandler,
    DeleteIssueRelationHandler
  ],
  exports: [IssuesService, IssueRepository]
})
export class TicketsModule {}
