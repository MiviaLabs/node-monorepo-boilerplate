import { Injectable } from '@nestjs/common';
import { StorageRegistryService } from '@package/storage/nest';

import type { FilePurpose } from '@package/db-core';

type RoutingInput = {
  organizationId: number;
  purpose: FilePurpose;
  fileId: number;
  originalFilename: string;
  issueAttachmentContext?: {
    issueId: number;
    projectId: number | null;
  };
};

type RoutingResult = {
  instanceName: string;
  objectKey: string;
};

const PURPOSE_INSTANCE_MAP: Readonly<Record<FilePurpose, string>> = Object.freeze({
  user_avatar: 'avatars',
  issue_attachment: 'uploads',
  content_upload: 'uploads'
});

@Injectable()
export class FileRoutingService {
  constructor(private readonly storageRegistry: StorageRegistryService) {}

  resolve(input: RoutingInput): RoutingResult {
    const preferredInstance = PURPOSE_INSTANCE_MAP[input.purpose];
    const availableInstances = new Set(this.storageRegistry.listInstanceNames());
    const instanceName = availableInstances.has(preferredInstance)
      ? preferredInstance
      : this.storageRegistry.getDefaultInstanceName();

    return {
      instanceName,
      objectKey: this.buildObjectKey(input)
    };
  }

  private buildObjectKey(input: RoutingInput): string {
    const safeFilename = this.sanitizeFilename(input.originalFilename);

    switch (input.purpose) {
      case 'user_avatar':
        return `org/${input.organizationId}/avatars/${input.fileId}/${safeFilename}`;
      case 'issue_attachment':
        if (input.issueAttachmentContext) {
          if (input.issueAttachmentContext.projectId !== null) {
            return `org/${input.organizationId}/project/${input.issueAttachmentContext.projectId}/issue/${input.issueAttachmentContext.issueId}/${input.fileId}/${safeFilename}`;
          }

          return `org/${input.organizationId}/issue/${input.issueAttachmentContext.issueId}/${input.fileId}/${safeFilename}`;
        }

        return `org/${input.organizationId}/uploads/issue_attachment/${input.fileId}/${safeFilename}`;
      case 'content_upload':
        return `org/${input.organizationId}/uploads/content_upload/${input.fileId}/${safeFilename}`;
      default:
        return `org/${input.organizationId}/uploads/file/${input.fileId}/${safeFilename}`;
    }
  }

  private sanitizeFilename(filename: string): string {
    const trimmed = filename.trim().toLowerCase();
    const replaced = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-');
    const sanitized = replaced.replace(/^-+|-+$/g, '');
    return sanitized.length > 0 ? sanitized : 'file';
  }
}
