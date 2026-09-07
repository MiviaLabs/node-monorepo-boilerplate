import { describe, expect, it, jest } from '@jest/globals';

import { FileRoutingService } from '../file-routing.service';

import type { StorageRegistryService } from '@package/storage/nest';

describe('FileRoutingService', () => {
  it('routes issue attachments into an issue-aware project path when context is present', () => {
    const storageRegistry = {
      listInstanceNames: jest.fn(() => ['uploads', 'avatars']),
      getDefaultInstanceName: jest.fn(() => 'uploads')
    } as unknown as StorageRegistryService;

    const service = new FileRoutingService(storageRegistry);

    const result = service.resolve({
      organizationId: 5,
      purpose: 'issue_attachment',
      fileId: 101,
      originalFilename: 'Design Spec.pdf',
      issueAttachmentContext: {
        issueId: 77,
        projectId: 12
      }
    });

    expect(result).toEqual({
      instanceName: 'uploads',
      objectKey: 'org/5/project/12/issue/77/101/design-spec.pdf'
    });
  });

  it('routes issue attachments into an org-level issue path when projectId is null', () => {
    const storageRegistry = {
      listInstanceNames: jest.fn(() => ['uploads', 'avatars']),
      getDefaultInstanceName: jest.fn(() => 'uploads')
    } as unknown as StorageRegistryService;

    const service = new FileRoutingService(storageRegistry);

    const result = service.resolve({
      organizationId: 5,
      purpose: 'issue_attachment',
      fileId: 101,
      originalFilename: 'Design Spec.pdf',
      issueAttachmentContext: {
        issueId: 77,
        projectId: null
      }
    });

    expect(result).toEqual({
      instanceName: 'uploads',
      objectKey: 'org/5/issue/77/101/design-spec.pdf'
    });
  });
});
