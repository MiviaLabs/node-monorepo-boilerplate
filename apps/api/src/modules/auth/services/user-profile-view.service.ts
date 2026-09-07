import { Injectable } from '@nestjs/common';
import { CachedPermissionService, CachedRoleService } from '@package/auth';

import { AvatarUrlResolverService } from './avatar-url-resolver.service';
import { UserProfileResponseDto } from '../dto/user-profile-response.dto';
import { AuthRepository } from '../repositories/auth.repository';
import { UserIdentityRepository } from '../repositories/user-identity.repository';

import type { User } from '@package/db-core';

type UserProfileViewInput = {
  tenantId: string;
  userId: string;
  actorId: string;
  email?: string;
  name?: string;
  username?: string;
  user: User;
};

@Injectable()
export class UserProfileViewService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userIdentityRepository: UserIdentityRepository,
    private readonly cachedRoleService: CachedRoleService,
    private readonly cachedPermissionService: CachedPermissionService,
    private readonly avatarUrlResolver: AvatarUrlResolverService
  ) {}

  async build(input: UserProfileViewInput): Promise<UserProfileResponseDto> {
    const userIdNum = Number(input.userId);
    const tenantIdNum = Number(input.tenantId);
    const roles = await this.cachedRoleService.getUserRoles(userIdNum, tenantIdNum);
    const permissions = await this.cachedPermissionService.getUserPermissions(
      userIdNum,
      tenantIdNum
    );
    const primaryIdentity = await this.userIdentityRepository.findPrimaryByUserId(userIdNum);
    const phoneNumber = await this.authRepository.decryptPhoneNumber(
      input.user.phoneNumberEncrypted
    );
    const photoUrl = await this.avatarUrlResolver.resolvePhotoUrl(input.tenantId, input.user);

    return UserProfileResponseDto.fromUserData({
      userId: input.userId,
      tenantId: input.tenantId,
      actorId: input.actorId,
      email: input.email,
      name: input.name,
      username: input.username,
      displayName: input.user.displayName ?? undefined,
      phoneNumber,
      photoUrl,
      avatarFileId: input.user.avatarFileId,
      isActive: input.user.isActive,
      isVerified: input.user.isVerified,
      emailVerified: primaryIdentity?.emailVerified ?? input.user.isVerified,
      roles,
      permissions
    });
  }
}
