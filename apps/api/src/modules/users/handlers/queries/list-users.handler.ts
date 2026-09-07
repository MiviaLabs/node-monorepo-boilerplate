import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { UserListItemDto, PaginatedResponseDto } from '../../dto';
import { ListUsersQuery } from '../../queries/list-users.query';
import { UserRepository } from '../../repositories/user.repository';

/**
 * List users query handler
 *
 * Returns paginated list of users within tenant scope
 */
@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<
  ListUsersQuery,
  PaginatedResponseDto<UserListItemDto>
> {
  constructor(private readonly repository: UserRepository) {}

  async execute(query: ListUsersQuery): Promise<PaginatedResponseDto<UserListItemDto>> {
    const { tenantId, page, pageSize } = query;

    // Run count and findWithPagination in parallel since they're independent
    // This reduces latency by avoiding sequential database + permission checks
    const [total, users] = await Promise.all([
      this.repository.count(tenantId),
      this.repository.findWithPagination(tenantId, page, pageSize)
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(total / pageSize);

    // Map to DTOs
    const data = users.map((user) => UserListItemDto.fromEntity(user));

    // Return paginated response
    return new PaginatedResponseDto(data, {
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1
    });
  }
}
