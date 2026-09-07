import { Test } from '@nestjs/testing';
import { RegisteredError } from '@package/errors';

import { GetMyOrganizationsQuery } from '../../../queries/get-my-organizations.query';
import { AuthRepository } from '../../../repositories/auth.repository';
import { GetMyOrganizationsHandler } from '../get-my-organizations.handler';

import type { UserOrganizationMembership } from '../../../repositories/auth.repository';
import type { TestingModule } from '@nestjs/testing';

describe('GetMyOrganizationsHandler', () => {
  let handler: GetMyOrganizationsHandler;
  let mockAuthRepository: jest.Mocked<AuthRepository>;

  beforeEach(async () => {
    mockAuthRepository = {
      listUserOrganizations: jest.fn()
    } as unknown as jest.Mocked<AuthRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetMyOrganizationsHandler,
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        }
      ]
    }).compile();

    handler = module.get<GetMyOrganizationsHandler>(GetMyOrganizationsHandler);
  });

  it('should return organizations for a valid user ID', async () => {
    const organizations: UserOrganizationMembership[] = [
      {
        organizationId: '12',
        tenantId: '34',
        name: 'Acme',
        displayName: 'Acme Inc',
        slug: 'acme',
        role: 'tenant_admin',
        isDefault: true,
        isActive: true
      }
    ];
    mockAuthRepository.listUserOrganizations.mockResolvedValue(organizations);

    const result = await handler.execute(new GetMyOrganizationsQuery({ userId: '123' }));

    expect(mockAuthRepository.listUserOrganizations).toHaveBeenCalledWith(123);
    expect(result).toEqual(organizations);
  });

  it('should throw for invalid user ID', async () => {
    await expect(
      handler.execute(new GetMyOrganizationsQuery({ userId: 'not-a-number' }))
    ).rejects.toThrow(RegisteredError);
  });
});
