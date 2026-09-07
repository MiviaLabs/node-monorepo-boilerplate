import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Errors } from '@package/errors';

import type { CurrentUserData } from '@/common/decorators/current-user.decorator';

/**
 * Guard to check if user can delete an account
 *
 * Allows:
 * - Admin users to delete any account in their tenant
 * - Users to delete their own account
 *
 * IMPORTANT: This guard compares user.userId (from JWT db_user_id claim) with targetUserId (from URL param).
 * If the JWT is missing db_user_id custom claim, userId will be the Firebase UID which won't match database IDs.
 */
@Injectable()
export class CanDeleteUserGuard implements CanActivate {
  private readonly logger = new Logger(CanDeleteUserGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & {
        user?: CurrentUserData;
        params: { id: string };
        tenantId?: string;
      }
    >();

    const user = request.user;
    const targetUserId = request.params.id;
    const tenantId = request.tenantId;

    // DEBUGGING: Log permission check with more details
    this.logger.debug('[CanDeleteUserGuard] Checking permissions:', {
      actorId: user?.userId,
      actorIdType: typeof user?.userId,
      actorIdLength: user?.userId?.length,
      actorRoles: user?.roles,
      targetUserId,
      targetUserIdType: typeof targetUserId,
      tenantId,
      hasUser: !!user,
      // Check if userId looks like a Firebase UID (long string) vs database ID (short number string)
      actorIdLooksLikeFirebaseUid: user?.userId && user.userId.length > 10
    });

    if (!user) {
      throw Errors.authinvalidEmailOr001({});
    }

    // Check if user is admin (includes tenant-level admin roles)
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- We need || to check if ANY role matches, not ?? which would only check the first non-null result
    const isAdmin =
      /* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
      user.roles?.includes('admin') ||
      user.roles?.includes('tenant_admin') ||
      user.roles?.includes('tenant_owner');
    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

    // Check if this is self-deletion
    const isSelfDeletion = user.userId === targetUserId;

    // CRITICAL: Detect if userId might be a Firebase UID instead of database ID
    // Firebase UIDs are typically 28 characters, database IDs are short numbers
    const userIdLooksLikeFirebaseUid = user.userId && user.userId.length > 10;
    const targetLooksLikeDatabaseId = /^\d+$/.test(targetUserId);

    if (!isSelfDeletion && userIdLooksLikeFirebaseUid && targetLooksLikeDatabaseId) {
      // This is likely a token issue - JWT doesn't have db_user_id custom claim
      this.logger.warn(
        '[CanDeleteUserGuard] Possible JWT custom claim issue detected. ' +
          `Actor userId (${user.userId.substring(0, 10)}...) looks like Firebase UID, ` +
          `but target (${targetUserId}) looks like database ID. ` +
          'User may need to re-login to refresh their token with db_user_id claim.'
      );
    }

    // Allow if admin or deleting own account
    if (isAdmin || isSelfDeletion) {
      this.logger.debug(
        `[CanDeleteUserGuard] Access GRANTED: isAdmin=${isAdmin}, isSelfDeletion=${isSelfDeletion}`
      );
      return true;
    }

    this.logger.warn(
      `[CanDeleteUserGuard] Access DENIED: User ${user.userId} attempted to delete ${targetUserId} without admin role`
    );

    throw Errors.authinsufficientPermissionsRequiredpermission004({
      requiredPermission: 'users:delete'
    });
  }
}
