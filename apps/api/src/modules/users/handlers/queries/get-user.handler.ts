import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { UserResponseDto } from '../../dto';
import { GetUserQuery } from '../../queries/get-user.query';
import { UserRepository } from '../../repositories/user.repository';

/**
 * Get user query handler
 *
 * Returns a single user by ID within tenant scope
 */
@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  constructor(private readonly repository: UserRepository) {}

  async execute(query: GetUserQuery): Promise<UserResponseDto> {
    const user = await this.repository.findByIdOrThrow(query.tenantId, query.userId);

    return UserResponseDto.fromEntity(user);
  }
}
