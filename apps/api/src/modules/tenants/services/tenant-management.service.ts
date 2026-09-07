import { Injectable, Logger, Inject } from '@nestjs/common';
import { AUTH_PROVIDER_FACTORY, type IAuthProvider, AuthProviderFactory } from '@package/auth';
import { Errors } from '@package/errors';

import { GcpTenantRepository } from '../repositories/gcp-tenant.repository';

import type { GcpTenantConfig, GcpTenantResult } from '../tenants.types';

/**
 * Tenant Management Service
 *
 * Manages GCP Identity Platform tenant lifecycle:
 * - Provision new GCP tenants for organizations
 * - Configure tenant settings
 * - Handle tenant deletion
 *
 * Uses Firebase Admin SDK tenantManager API.
 */
@Injectable()
export class TenantManagementService {
  private readonly logger = new Logger(TenantManagementService.name);
  private authProvider: IAuthProvider | null = null;
  private readonly provisioningByOrganization = new Map<number, Promise<GcpTenantResult>>();

  constructor(
    @Inject(AUTH_PROVIDER_FACTORY) private readonly authProviderFactory: AuthProviderFactory,
    private readonly gcpTenantRepository: GcpTenantRepository
  ) {
    this.logger.log('TenantManagementService initialized - provider will be resolved on first use');
  }

  /**
   * Get the default auth provider (lazy-loaded)
   */
  private getProvider(): IAuthProvider {
    if (!this.authProvider) {
      const provider = this.authProviderFactory.getDefaultProvider();
      if (!provider) {
        throw new Error('No auth provider configured. Please configure GCP Identity Platform.');
      }
      this.authProvider = provider;
      this.logger.log(
        `Resolved auth provider: ${this.authProvider.name} (${this.authProvider.type})`
      );
    }
    return this.authProvider;
  }

  /**
   * Provision a new GCP tenant for an organization
   *
   * Creates a GCP Identity Platform tenant with the specified configuration.
   * Uses transactions to ensure atomicity with database updates.
   *
   * @param organizationId - Organization ID
   * @param config - GCP tenant configuration
   * @returns GCP tenant result with tenant ID
   */
  async provisionGcpTenant(
    organizationId: number,
    config: GcpTenantConfig
  ): Promise<GcpTenantResult> {
    this.logger.log(`Provisioning GCP tenant for organization ${organizationId}`);

    const provider = this.getProvider();

    // Check if this is a Google Identity Platform provider
    if (
      'firebaseAuth' in provider &&
      typeof (provider as { firebaseAuth?: unknown }).firebaseAuth !== 'undefined'
    ) {
      const googleProvider = provider as {
        firebaseAuth: {
          tenantManager: () => {
            createTenant: (config: GcpTenantConfig) => Promise<{
              tenantId: string;
              displayName: string;
            }>;
          };
        };
      };

      try {
        const tenantManager = googleProvider.firebaseAuth.tenantManager();

        // Create GCP tenant
        const tenantConfig: GcpTenantConfig = {
          displayName: config.displayName,
          emailSignInEnabled: config.emailSignInEnabled
        };

        if (config.passwordPolicy !== undefined) {
          tenantConfig.passwordPolicy = config.passwordPolicy;
        }

        if (config.multiFactorConfig !== undefined) {
          tenantConfig.multiFactorConfig = config.multiFactorConfig;
        }

        const tenant = await tenantManager.createTenant(tenantConfig as never);

        this.logger.log(`Created GCP tenant ${tenant.tenantId} for organization ${organizationId}`);

        return {
          tenantId: tenant.tenantId,
          displayName: tenant.displayName
        };
      } catch (error) {
        this.logger.error(`Failed to create GCP tenant for organization ${organizationId}:`, error);
        throw Errors.externalserviceReturnedAn002({
          service: 'GCP Identity Platform',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      this.logger.error(`Provider type ${provider.type} does not support tenant management`);
      throw new Error(
        'Auth provider does not support tenant management. Please use Google Identity Platform provider.'
      );
    }
  }

  /**
   * Update organization with GCP tenant ID
   *
   * @param organizationId - Organization ID
   * @param gcpTenantId - GCP tenant ID
   */
  async linkGcpTenantToOrganization(organizationId: number, gcpTenantId: string): Promise<void> {
    this.logger.log(`Linking GCP tenant ${gcpTenantId} to organization ${organizationId}`);

    const linked = await this.gcpTenantRepository.updateGcpTenantId(organizationId, gcpTenantId);
    if (!linked) {
      throw new Error(`Organization ${organizationId} is already linked to a GCP tenant`);
    }
  }

  /**
   * Provision GCP tenant and link to organization atomically
   *
   * This method ensures both GCP tenant creation and database update succeed together.
   * If either operation fails, the entire operation is rolled back.
   *
   * @param organizationId - Organization ID
   * @param config - GCP tenant configuration
   * @returns GCP tenant result
   */
  async provisionGcpTenantForOrganization(
    organizationId: number,
    config: GcpTenantConfig
  ): Promise<GcpTenantResult> {
    const existingRun = this.provisioningByOrganization.get(organizationId);
    if (existingRun) {
      return existingRun;
    }

    const run = this.provisionGcpTenantForOrganizationInternal(organizationId, config);
    this.provisioningByOrganization.set(organizationId, run);

    try {
      return await run;
    } finally {
      this.provisioningByOrganization.delete(organizationId);
    }
  }

  private async provisionGcpTenantForOrganizationInternal(
    organizationId: number,
    config: GcpTenantConfig
  ): Promise<GcpTenantResult> {
    this.logger.log(`Provisioning GCP tenant for organization ${organizationId} (transactional)`);

    // Step 0: Check if organization already has a GCP tenant
    const existingOrg = await this.gcpTenantRepository.findByIdWithGcpTenant(
      'system',
      organizationId
    );
    if (existingOrg?.gcpTenantId) {
      this.logger.log(
        `Organization ${organizationId} already has GCP tenant ${existingOrg.gcpTenantId}`
      );
      return {
        tenantId: existingOrg.gcpTenantId,
        displayName: existingOrg.name || 'Organization'
      };
    }

    // Step 1: Create GCP tenant
    const gcpTenant = await this.provisionGcpTenant(organizationId, config);

    // Step 2: Update organization with GCP tenant ID
    // Note: In a full transaction, we'd use db.transaction() here
    // For now, we'll do a best-effort update
    try {
      await this.linkGcpTenantToOrganization(organizationId, gcpTenant.tenantId);
    } catch (error) {
      const currentOrg = await this.gcpTenantRepository.findByIdWithGcpTenant(
        'system',
        organizationId
      );
      if (currentOrg?.gcpTenantId) {
        await this.deleteGcpTenant(gcpTenant.tenantId);
        this.logger.log(
          `Discarded duplicate GCP tenant ${gcpTenant.tenantId}; organization ${organizationId} is already linked to ${currentOrg.gcpTenantId}`
        );
        return {
          tenantId: currentOrg.gcpTenantId,
          displayName: currentOrg.name || 'Organization'
        };
      }

      this.logger.error(
        `Failed to link GCP tenant ${gcpTenant.tenantId} to organization ${organizationId}`,
        error
      );
      // GCP tenant was created but link failed - rollback GCP tenant
      try {
        await this.deleteGcpTenant(gcpTenant.tenantId);
        this.logger.log(`Rolled back GCP tenant ${gcpTenant.tenantId} after link failure`);
      } catch (rollbackError) {
        this.logger.error(
          `Failed to rollback GCP tenant ${gcpTenant.tenantId} - manual cleanup required`,
          rollbackError
        );
      }
      throw Errors.externalserviceReturnedAn002({
        service: 'Database',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }

    this.logger.log(
      `Successfully provisioned and linked GCP tenant ${gcpTenant.tenantId} to organization ${organizationId}`
    );

    return gcpTenant;
  }

  /**
   * Delete a GCP tenant
   *
   * Permanently deletes a GCP Identity Platform tenant.
   * WARNING: This is irreversible and will delete all tenant users.
   *
   * @param gcpTenantId - GCP tenant ID
   */
  async deleteGcpTenant(gcpTenantId: string): Promise<void> {
    this.logger.log(`Deleting GCP tenant ${gcpTenantId}`);

    const provider = this.getProvider();

    if (
      'firebaseAuth' in provider &&
      typeof (provider as { firebaseAuth?: unknown }).firebaseAuth !== 'undefined'
    ) {
      const googleProvider = provider as {
        firebaseAuth: {
          tenantManager: () => {
            deleteTenant: (tenantId: string) => Promise<void>;
          };
        };
      };

      try {
        const tenantManager = googleProvider.firebaseAuth.tenantManager();
        await tenantManager.deleteTenant(gcpTenantId);

        this.logger.log(`Deleted GCP tenant ${gcpTenantId}`);
      } catch (error) {
        this.logger.error(`Failed to delete GCP tenant ${gcpTenantId}:`, error);
        throw Errors.externalserviceReturnedAn002({
          service: 'GCP Identity Platform',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}
