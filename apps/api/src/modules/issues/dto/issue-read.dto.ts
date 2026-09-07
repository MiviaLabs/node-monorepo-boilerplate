import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  IssueActivityDtoShape,
  IssueAttachmentDtoShape,
  IssueCommentDtoShape,
  IssueDetailDtoShape,
  IssuePageDtoShape,
  IssueLabelDtoShape,
  IssueListItemDtoShape,
  IssueParticipantDtoShape,
  IssueProjectDtoShape,
  IssueRelationDtoShape,
  IssuesSummaryDtoShape,
  IssueWorkspaceProjectDtoShape,
  IssueWorkspaceProjectMemberDtoShape,
  MyWorkPageDtoShape,
  WorkspaceIssuesPageDtoShape
} from '../types/issue.types';

export class IssueParticipantDto implements IssueParticipantDtoShape {
  @ApiProperty({ example: 9 })
  declare userId: number;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare displayName: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  declare photoUrl: string | null;
}

export class IssueLabelDto implements IssueLabelDtoShape {
  @ApiProperty({ example: 3 })
  declare id: number;

  @ApiProperty({ example: 'Frontend' })
  declare name: string;

  @ApiPropertyOptional({ example: '#38bdf8', nullable: true })
  declare color: string | null;

  @ApiPropertyOptional({ example: 'Touches UI and browser-side behavior.', nullable: true })
  declare description: string | null;

  @ApiPropertyOptional({ example: 12, nullable: true })
  declare projectId: number | null;
}

export class IssueProjectDto implements IssueProjectDtoShape {
  @ApiProperty({ example: 12 })
  declare id: number;

  @ApiProperty({ example: 'ATLAS' })
  declare key: string;

  @ApiProperty({ example: 'Atlas' })
  declare name: string;

  @ApiProperty({ example: 'private' })
  declare visibility: IssueProjectDtoShape['visibility'];
}

export class IssueCommentDto implements IssueCommentDtoShape {
  @ApiProperty({ example: 41 })
  declare id: number;

  @ApiProperty({ example: 9 })
  declare authorUserId: number;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare authorDisplayName: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  declare authorPhotoUrl: string | null;

  @ApiProperty({ example: 'Need API payload confirmation before we merge.' })
  declare bodyMarkdown: string;

  @ApiProperty({ example: '2026-03-22T03:00:00.000Z' })
  declare createdAt: string | Date;

  @ApiProperty({ example: '2026-03-22T03:15:00.000Z' })
  declare updatedAt: string | Date;
}

export class IssueAttachmentDto implements IssueAttachmentDtoShape {
  @ApiProperty({ example: 51 })
  declare id: number;

  @ApiProperty({ example: 77 })
  declare issueId: number;

  @ApiProperty({ example: 9 })
  declare uploadedByUserId: number;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare uploaderDisplayName: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  declare uploaderPhotoUrl: string | null;

  @ApiPropertyOptional({ example: 101, nullable: true })
  declare fileId: number | null;

  @ApiProperty({ example: 'design-spec.pdf' })
  declare originalFilename: string;

  @ApiPropertyOptional({ example: 'application/pdf', nullable: true })
  declare mimeType: string | null;

  @ApiProperty({ example: 102400 })
  declare byteSize: number;

  @ApiPropertyOptional({ example: 'ready', nullable: true })
  declare status: IssueAttachmentDtoShape['status'];

  @ApiPropertyOptional({ example: 'private', nullable: true })
  declare visibility: IssueAttachmentDtoShape['visibility'];

  @ApiPropertyOptional({ example: 'uploads', nullable: true })
  declare storageInstance: string | null;

  @ApiPropertyOptional({ example: 'app-uploads', nullable: true })
  declare bucket: string | null;

  @ApiPropertyOptional({
    example: 'org/12/uploads/issue_attachment/101/design-spec.pdf',
    nullable: true
  })
  declare objectKey: string | null;

  @ApiProperty({ example: '2026-03-22T03:15:00.000Z' })
  declare createdAt: string | Date;
}

export class IssueRelationDto implements IssueRelationDtoShape {
  @ApiProperty({ example: 11 })
  declare id: number;

  @ApiProperty({ example: 'blocks' })
  declare relationType: 'blocks' | 'blocked_by' | 'related' | 'duplicate_of';

  @ApiProperty({ example: 77 })
  declare relatedIssueId: number;

  @ApiProperty({ example: 'Ship workspace issue details' })
  declare relatedIssueTitle: string;

  @ApiProperty({ example: 142 })
  declare relatedIssueNumber: number;
}

export class IssueActivityDto implements IssueActivityDtoShape {
  @ApiProperty({ example: 88 })
  declare id: number;

  @ApiProperty({ example: 'issue.created' })
  declare activityType: string;

  @ApiPropertyOptional({ example: 9, nullable: true })
  declare actorUserId: number | null;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare actorDisplayName: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  declare actorPhotoUrl: string | null;

  @ApiProperty({ example: { status: 'in_progress' } })
  declare metadata: Record<string, unknown>;

  @ApiProperty({ example: '2026-03-22T03:15:00.000Z' })
  declare createdAt: string | Date;
}

export class IssueListItemDto implements IssueListItemDtoShape {
  @ApiProperty({ example: 77 })
  declare id: number;

  @ApiProperty({ example: 5 })
  declare organizationId: number;

  @ApiPropertyOptional({ example: 12, nullable: true })
  declare projectId: number | null;

  @ApiPropertyOptional({ type: IssueProjectDto, nullable: true })
  declare project: IssueProjectDto | null;

  @ApiPropertyOptional({ example: 73, nullable: true })
  declare parentIssueId: number | null;

  @ApiProperty({ example: 142 })
  declare issueNumber: number;

  @ApiProperty({ example: 'Restore standalone issue details page' })
  declare title: string;

  @ApiProperty({ example: 'Bring back the previous details experience on the canonical route.' })
  declare descriptionMarkdown: string;

  @ApiProperty({ example: 'in_progress' })
  declare status: 'backlog' | 'in_progress' | 'blocked' | 'done';

  @ApiProperty({ example: 'high' })
  declare priority: 'urgent' | 'high' | 'medium' | 'low';

  @ApiProperty({ example: 1 })
  declare position: number;

  @ApiPropertyOptional({ example: 5, nullable: true })
  declare estimate: number | null;

  @ApiPropertyOptional({ example: '2026-03-29T00:00:00.000Z', nullable: true })
  declare dueAt: string | Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  declare resolvedAt: string | Date | null;

  @ApiProperty({ example: 9 })
  declare createdBy: number;

  @ApiProperty({ example: 9 })
  declare updatedBy: number;

  @ApiProperty({ example: '2026-03-21T00:00:00.000Z' })
  declare createdAt: string | Date;

  @ApiProperty({ example: '2026-03-22T03:15:00.000Z' })
  declare updatedAt: string | Date;

  @ApiProperty({ type: IssueParticipantDto, isArray: true })
  declare assignees: IssueParticipantDto[];

  @ApiProperty({ type: IssueLabelDto, isArray: true })
  declare labels: IssueLabelDto[];

  @ApiProperty({ example: 3 })
  declare commentsCount: number;

  @ApiProperty({ example: 1 })
  declare attachmentsCount: number;

  @ApiProperty({ example: 2 })
  declare watchersCount: number;

  @ApiProperty({ example: 4 })
  declare subtaskCount: number;

  @ApiProperty({ example: 1 })
  declare completedSubtaskCount: number;

  @ApiPropertyOptional({ type: IssueActivityDto, isArray: true })
  declare activity?: IssueActivityDto[];
}

export class IssueDetailDto extends IssueListItemDto implements IssueDetailDtoShape {
  @ApiProperty({ type: IssueParticipantDto, isArray: true })
  declare watchers: IssueParticipantDto[];

  @ApiProperty({ type: IssueCommentDto, isArray: true })
  declare comments: IssueCommentDto[];

  @ApiProperty({ type: IssueRelationDto, isArray: true })
  declare relations: IssueRelationDto[];

  @ApiProperty({ type: IssueListItemDto, isArray: true })
  declare subtasks: IssueListItemDto[];

  @ApiProperty({ type: IssueActivityDto, isArray: true })
  declare activity: IssueActivityDto[];
}

export class IssuesSummaryDto implements IssuesSummaryDtoShape {
  @ApiProperty({ example: 24 })
  declare total: number;

  @ApiProperty({ example: 10 })
  declare backlog: number;

  @ApiProperty({ example: 8 })
  declare inProgress: number;

  @ApiProperty({ example: 3 })
  declare blocked: number;

  @ApiProperty({ example: 3 })
  declare done: number;

  @ApiProperty({ example: 21 })
  declare open: number;
}

export class IssueWorkspaceProjectDto implements IssueWorkspaceProjectDtoShape {
  @ApiProperty({ example: 12 })
  declare id: number;

  @ApiProperty({ example: 5 })
  declare organizationId: number;

  @ApiProperty({ example: 9 })
  declare createdBy: number;

  @ApiProperty({ example: 'ATLAS' })
  declare key: string;

  @ApiProperty({ example: 'Atlas' })
  declare name: string;

  @ApiProperty({ example: 'private' })
  declare visibility: IssueWorkspaceProjectDtoShape['visibility'];

  @ApiProperty({ example: true })
  declare isMember: boolean;
}

export class IssueWorkspaceProjectMemberDto implements IssueWorkspaceProjectMemberDtoShape {
  @ApiProperty({ example: 9 })
  declare userId: number;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare displayName: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  declare photoUrl: string | null;

  @ApiProperty({ example: false })
  declare isCreator: boolean;

  @ApiProperty({ example: '2026-03-21T00:00:00.000Z' })
  declare assignedAt: string | Date;
}

export class WorkspaceIssuesPageDto implements WorkspaceIssuesPageDtoShape {
  @ApiProperty({
    type: 'object',
    additionalProperties: false,
    properties: {
      data: { type: 'array', items: { $ref: '#/components/schemas/IssueListItemDto' } },
      metadata: {
        type: 'object',
        properties: {
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'number', example: 1 },
              pageSize: { type: 'number', example: 500 },
              total: { type: 'number', example: 42 },
              totalPages: { type: 'number', example: 1 },
              hasNext: { type: 'boolean', example: false },
              hasPrevious: { type: 'boolean', example: false }
            }
          }
        }
      }
    }
  })
  declare issues: WorkspaceIssuesPageDtoShape['issues'];

  @ApiProperty({ type: IssueLabelDto, isArray: true })
  declare labels: IssueLabelDto[];

  @ApiProperty({ type: IssueWorkspaceProjectDto, isArray: true })
  declare projects: IssueWorkspaceProjectDto[];

  @ApiProperty({ type: IssueWorkspaceProjectMemberDto, isArray: true })
  declare organizationMembers: IssueWorkspaceProjectMemberDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: {
      type: 'array',
      items: { $ref: '#/components/schemas/IssueWorkspaceProjectMemberDto' }
    }
  })
  declare privateProjectMembersByProjectId: Record<string, IssueWorkspaceProjectMemberDto[]>;
}

export class MyWorkPageDto implements MyWorkPageDtoShape {
  @ApiProperty({ type: IssueListItemDto, isArray: true })
  declare assignedIssues: IssueListItemDto[];

  @ApiProperty({ example: 18 })
  declare assignedIssueCount: number;

  @ApiProperty({ type: IssueListItemDto, isArray: true })
  declare watchingIssues: IssueListItemDto[];

  @ApiProperty({ type: IssueListItemDto, isArray: true })
  declare recentIssues: IssueListItemDto[];

  @ApiProperty({ example: 12 })
  declare accessibleProjectCount: number;

  @ApiProperty({ example: 4 })
  declare ownedProjectCount: number;

  @ApiProperty({ example: 8 })
  declare collaborationProjectCount: number;
}

export class IssuePageDto implements IssuePageDtoShape {
  @ApiProperty({ type: IssueDetailDto })
  declare issue: IssueDetailDto;

  @ApiProperty({ type: IssueAttachmentDto, isArray: true })
  declare attachments: IssueAttachmentDto[];

  @ApiProperty({ type: IssueLabelDto, isArray: true })
  declare labels: IssueLabelDto[];

  @ApiProperty({ type: IssueWorkspaceProjectMemberDto, isArray: true })
  declare members: IssueWorkspaceProjectMemberDto[];

  @ApiProperty({ type: IssueListItemDto, isArray: true })
  declare relationCandidates: IssueListItemDto[];
}
