import { Injectable, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { UserProfileResponseDto } from '../../dto/user-profile-response.dto';
import { GetUserProfileQuery } from '../../queries/get-user-profile.query';
import { AuthRepository } from '../../repositories/auth.repository';
import { UserProfileViewService } from '../../services/user-profile-view.service';

/**
 * Get user profile query handler
 *
 * Returns the authenticated user's profile after verifying the account exists
 * and is active in the database. This adds a layer of security by ensuring
 * the user hasn't been deleted or suspended since the JWT was issued.
 */
@QueryHandler(GetUserProfileQuery)
@Injectable()
export class GetUserProfileHandler implements IQueryHandler<GetUserProfileQuery> {
  private readonly logger = new Logger(GetUserProfileHandler.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userProfileViewService: UserProfileViewService
  ) {}

  async execute(query: GetUserProfileQuery): Promise<UserProfileResponseDto> {
    this.logger.debug('Getting user profile');

    // Validate userId is a positive integer before DB query
    const userIdNum = Number(query.userId);
    if (Number.isNaN(userIdNum) || userIdNum <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive integer'
      });
    }

    // Verify user exists and is active in database
    // This prevents stale JWT tokens from accessing the system after account deletion/suspension
    const user = await this.authRepository.findById(query.tenantId, userIdNum);

    // Security: Check if user was deleted, doesn't exist, or is inactive
    // Note: AuthRepository.findById() already filters soft-deleted users (deletedAt IS NULL)
    if (!user?.isActive) {
      throw Errors.useruserWithId001({ userId: query.userId });
    }

    return this.userProfileViewService.build({
      tenantId: query.tenantId,
      userId: query.userId,
      actorId: query.actorId,
      email: query.email,
      name: query.name,
      username: query.username,
      user
    });
  }
}
