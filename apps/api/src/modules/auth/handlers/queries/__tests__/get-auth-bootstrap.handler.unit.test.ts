import { Test } from '@nestjs/testing';

import { GetAuthBootstrapQuery } from '../../../queries/get-auth-bootstrap.query';
import { AuthRepository } from '../../../repositories/auth.repository';
import { UserOrganizationSettingsRepository } from '../../../repositories/user-organization-settings.repository';
import { UserProfileViewService } from '../../../services/user-profile-view.service';
import { GetAuthBootstrapHandler } from '../get-auth-bootstrap.handler';

import type { TestingModule } from '@nestjs/testing';

describe('GetAuthBootstrapHandler', () => {
  let handler: GetAuthBootstrapHandler;
  let authRepository: {
    findById: jest.Mock;
    findOrganizationById: jest.Mock;
    listUserOrganizations: jest.Mock;
  };
  let userOrganizationSettingsRepository: {
    getMany: jest.Mock;
  };
  let userProfileViewService: {
    build: jest.Mock;
  };

  beforeEach(async () => {
    authRepository = {
      findById: jest.fn(),
      findOrganizationById: jest.fn(),
      listUserOrganizations: jest.fn()
    };
    userOrganizationSettingsRepository = {
      getMany: jest.fn()
    };
    userProfileViewService = {
      build: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAuthBootstrapHandler,
        {
          provide: AuthRepository,
          useValue: authRepository
        },
        {
          provide: UserOrganizationSettingsRepository,
          useValue: userOrganizationSettingsRepository
        },
        {
          provide: UserProfileViewService,
          useValue: userProfileViewService
        }
      ]
    }).compile();

    handler = module.get(GetAuthBootstrapHandler);
  });

  it('returns the bootstrap payload for the current workspace', async () => {
    authRepository.findById.mockResolvedValue({
      id: 42,
      displayName: 'Test User',
      isActive: true
    });
    authRepository.listUserOrganizations.mockResolvedValue([
      {
        organizationId: '7',
        tenantId: '100',
        name: 'Acme Corp',
        displayName: 'Acme',
        slug: 'acme-corp',
        role: 'tenant_owner',
        isDefault: true,
        isActive: true
      },
      {
        organizationId: '9',
        tenantId: '101',
        name: 'Dormant Corp',
        displayName: 'Dormant',
        slug: 'dormant-corp',
        role: 'tenant_viewer',
        isDefault: false,
        isActive: false
      }
    ]);
    authRepository.findOrganizationById.mockResolvedValue({
      id: 7,
      name: 'Acme Corp',
      displayName: 'Acme',
      slug: 'acme-corp'
    });
    userOrganizationSettingsRepository.getMany.mockResolvedValue([
      {
        settingKey: 'dashboard.default_view',
        valueJson: 'projects'
      }
    ]);
    userProfileViewService.build.mockReturnValue({
      userId: '42',
      tenantId: '7',
      actorId: '42',
      email: 'user@example.com',
      name: 'Test User',
      displayName: 'Test User',
      roles: ['tenant_owner'],
      permissions: ['tenant:projects:read']
    });

    const result = await handler.execute(
      new GetAuthBootstrapQuery({
        userId: '42',
        tenantId: '7',
        actorId: '42',
        email: 'user@example.com',
        name: 'Test User',
        roles: ['tenant_owner'],
        permissions: ['tenant:projects:read']
      })
    );

    expect(authRepository.findById).toHaveBeenCalledWith('7', 42);
    expect(authRepository.listUserOrganizations).toHaveBeenCalledWith(42);
    expect(userOrganizationSettingsRepository.getMany).toHaveBeenCalledWith({
      organizationId: 7,
      userId: 42
    });
    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          userId: '42',
          tenantId: '7'
        }),
        organizations: [
          expect.objectContaining({
            organizationId: '7',
            isActive: true
          })
        ],
        currentOrganizationId: '7',
        tenantName: 'Acme Corp',
        tenantDisplayName: 'Acme',
        tenantSlug: 'acme-corp'
      })
    );
  });

  it('falls back to the default active organization when tenant does not match an active membership', async () => {
    authRepository.findById.mockResolvedValue({
      id: 42,
      displayName: 'Test User',
      isActive: true
    });
    authRepository.listUserOrganizations.mockResolvedValue([
      {
        organizationId: '11',
        tenantId: '100',
        name: 'Fallback Org',
        displayName: undefined,
        slug: 'fallback-org',
        role: 'tenant_owner',
        isDefault: true,
        isActive: true
      }
    ]);
    authRepository.findOrganizationById.mockResolvedValue(null);
    userOrganizationSettingsRepository.getMany.mockResolvedValue([]);
    userProfileViewService.build.mockReturnValue({
      userId: '42',
      tenantId: '999',
      actorId: '42',
      email: 'user@example.com',
      roles: [],
      permissions: []
    });

    const result = await handler.execute(
      new GetAuthBootstrapQuery({
        userId: '42',
        tenantId: '999',
        actorId: '42'
      })
    );

    expect(userOrganizationSettingsRepository.getMany).toHaveBeenCalledWith({
      organizationId: 11,
      userId: 42
    });
    expect(result.currentOrganizationId).toBe('11');
    expect(result.user.tenantId).toBe('11');
    expect(result.tenantName).toBe('Fallback Org');
    expect(result.tenantDisplayName).toBe('Fallback Org');
    expect(result.tenantSlug).toBe('fallback-org');
  });
});
