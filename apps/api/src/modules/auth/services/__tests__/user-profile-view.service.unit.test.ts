import { Test } from '@nestjs/testing';
import { CachedPermissionService, CachedRoleService } from '@package/auth';

import { AuthRepository } from '../../repositories/auth.repository';
import { UserIdentityRepository } from '../../repositories/user-identity.repository';
import { AvatarUrlResolverService } from '../avatar-url-resolver.service';
import { UserProfileViewService } from '../user-profile-view.service';

import type { TestingModule } from '@nestjs/testing';
import type { users } from '@package/db-core';

describe('UserProfileViewService', () => {
  let service: UserProfileViewService;
  let authRepository: jest.Mocked<AuthRepository>;
  let userIdentityRepository: jest.Mocked<UserIdentityRepository>;
  let cachedRoleService: jest.Mocked<CachedRoleService>;
  let cachedPermissionService: jest.Mocked<CachedPermissionService>;
  let avatarUrlResolver: { resolvePhotoUrl: jest.Mock };

  beforeEach(async () => {
    avatarUrlResolver = {
      resolvePhotoUrl: jest.fn()
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileViewService,
        {
          provide: AuthRepository,
          useValue: {
            decryptPhoneNumber: jest.fn()
          }
        },
        {
          provide: UserIdentityRepository,
          useValue: {
            findPrimaryByUserId: jest.fn()
          }
        },
        {
          provide: CachedRoleService,
          useValue: {
            getUserRoles: jest.fn()
          }
        },
        {
          provide: CachedPermissionService,
          useValue: {
            getUserPermissions: jest.fn()
          }
        },
        {
          provide: AvatarUrlResolverService,
          useValue: {
            resolvePhotoUrl: avatarUrlResolver.resolvePhotoUrl
          }
        }
      ]
    }).compile();

    service = module.get(UserProfileViewService);
    authRepository = module.get(AuthRepository);
    userIdentityRepository = module.get(UserIdentityRepository);
    cachedRoleService = module.get(CachedRoleService);
    cachedPermissionService = module.get(CachedPermissionService);
  });

  it('resolves photoUrl from avatar file when avatarFileId exists', async () => {
    authRepository.decryptPhoneNumber.mockResolvedValue(undefined);
    userIdentityRepository.findPrimaryByUserId.mockResolvedValue({ emailVerified: true } as never);
    cachedRoleService.getUserRoles.mockResolvedValue(['tenant_user']);
    cachedPermissionService.getUserPermissions.mockResolvedValue(['tenant:users:read']);
    avatarUrlResolver.resolvePhotoUrl.mockResolvedValue('https://signed.example.test/avatar.png');

    const result = await service.build({
      tenantId: '201',
      userId: '101',
      actorId: '101',
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        isActive: true,
        isVerified: true,
        photoUrl: 'https://legacy.example.test/avatar.png',
        avatarFileId: 301
      } as typeof users.$inferSelect
    });

    expect(avatarUrlResolver.resolvePhotoUrl).toHaveBeenCalledWith(
      '201',
      expect.objectContaining({ id: 101, avatarFileId: 301 })
    );
    expect(result.photoUrl).toBe('https://signed.example.test/avatar.png');
  });

  it('falls back to legacy photoUrl when no avatar file is attached', async () => {
    authRepository.decryptPhoneNumber.mockResolvedValue(undefined);
    userIdentityRepository.findPrimaryByUserId.mockResolvedValue(null);
    cachedRoleService.getUserRoles.mockResolvedValue([]);
    cachedPermissionService.getUserPermissions.mockResolvedValue([]);
    avatarUrlResolver.resolvePhotoUrl.mockResolvedValue('https://legacy.example.test/avatar.png');

    const result = await service.build({
      tenantId: '201',
      userId: '101',
      actorId: '101',
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        isActive: true,
        isVerified: true,
        photoUrl: 'https://legacy.example.test/avatar.png',
        avatarFileId: null
      } as typeof users.$inferSelect
    });

    expect(result.photoUrl).toBe('https://legacy.example.test/avatar.png');
    expect(avatarUrlResolver.resolvePhotoUrl).toHaveBeenCalled();
  });

  it('preserves an explicit null photoUrl when the user has no avatar', async () => {
    authRepository.decryptPhoneNumber.mockResolvedValue(undefined);
    userIdentityRepository.findPrimaryByUserId.mockResolvedValue(null);
    cachedRoleService.getUserRoles.mockResolvedValue([]);
    cachedPermissionService.getUserPermissions.mockResolvedValue([]);
    avatarUrlResolver.resolvePhotoUrl.mockResolvedValue(null);

    const result = await service.build({
      tenantId: '201',
      userId: '101',
      actorId: '101',
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        isActive: true,
        isVerified: true,
        photoUrl: null,
        avatarFileId: null
      } as typeof users.$inferSelect
    });

    expect(Object.prototype.hasOwnProperty.call(result, 'photoUrl')).toBe(true);
    expect(result.photoUrl).toBeNull();
  });
});
