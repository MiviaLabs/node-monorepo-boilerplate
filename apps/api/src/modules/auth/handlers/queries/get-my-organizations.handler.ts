import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { UserOrganizationDto } from '../../dto';
import { GetMyOrganizationsQuery } from '../../queries/get-my-organizations.query';
import { AuthRepository } from '../../repositories/auth.repository';

@QueryHandler(GetMyOrganizationsQuery)
export class GetMyOrganizationsHandler implements IQueryHandler<GetMyOrganizationsQuery> {
  constructor(private readonly authRepository: AuthRepository) {}

  async execute(query: GetMyOrganizationsQuery): Promise<UserOrganizationDto[]> {
    const userId = Number(query.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive integer'
      });
    }

    const organizations = await this.authRepository.listUserOrganizations(userId);
    return organizations.map((organization) => ({
      organizationId: organization.organizationId,
      tenantId: organization.tenantId,
      name: organization.name,
      ...(organization.displayName ? { displayName: organization.displayName } : {}),
      slug: organization.slug,
      role: organization.role,
      isDefault: organization.isDefault,
      isActive: organization.isActive
    }));
  }
}
