/**
 * Tenant validation schemas
 */

import { boolean, number, optional, string, z } from 'zod';

/**
 * Tenant type enumeration schema.
 *
 * Categorizes tenants by their organizational structure.
 *
 * **Allowed Values:**
 * - `'organization'`: Full organization with multiple teams/departments
 * - `'team'`: Subset of an organization (department, project team)
 * - `'individual'`: Single-user tenant (personal workspace)
 *
 * @example
 * tenantTypeEnum.parse('organization'); // ✓
 * tenantTypeEnum.parse('team');         // ✓
 * tenantTypeEnum.parse('individual');   // ✓
 */
export const tenantTypeEnum = z.enum(['organization', 'team', 'individual']);
export type TenantType = z.infer<typeof tenantTypeEnum>;

/**
 * Tenant status enumeration schema.
 *
 * Represents the lifecycle state of a tenant.
 *
 * **Allowed Values:**
 * - `'draft'`: Tenant created but not yet activated
 * - `'trial'`: Tenant in trial period with limited access
 * - `'active'`: Fully operational tenant with paid subscription
 * - `'suspended'`: Tenant access restricted (payment issues, policy violation)
 * - `'deleted'`: Tenant marked for deletion (soft delete)
 *
 * @example
 * tenantStatusEnum.parse('active');    // ✓
 * tenantStatusEnum.parse('trial');     // ✓
 * tenantStatusEnum.parse('suspended'); // ✓
 */
export const tenantStatusEnum = z.enum(['draft', 'trial', 'active', 'suspended', 'deleted']);
export type TenantStatus = z.infer<typeof tenantStatusEnum>;

/**
 * Tenant features settings schema.
 *
 * Defines feature flags and limits for a tenant's subscription tier.
 * Uses strict mode to reject unknown properties.
 *
 * **Optional Fields:**
 * - `maxUsers`: Maximum allowed users (positive integer)
 * - `maxProjects`: Maximum allowed projects (positive integer)
 * - `advancedAnalytics`: Access to advanced analytics features
 * - `apiAccess`: Access to public API
 * - `customIntegrations`: Ability to create custom integrations
 * - `sso`: Single Sign-On capability
 * - `auditLogRetention`: Days to retain audit logs (non-negative integer)
 *
 * @example
 * tenantFeaturesSchema.parse({
 *   maxUsers: 50,
 *   maxProjects: 10,
 *   advancedAnalytics: true,
 *   apiAccess: true,
 *   sso: false,
 *   auditLogRetention: 90
 * });
 *
 * // Minimal features
 * tenantFeaturesSchema.parse({ maxUsers: 5 });
 *
 * // Empty (all defaults)
 * tenantFeaturesSchema.parse({});
 *
 * @example
 * // Invalid (strict mode rejects extra properties)
 * tenantFeaturesSchema.parse({ unknownFeature: true }); // ZodError
 */
export const tenantFeaturesSchema = z
  .object({
    maxUsers: optional(number().int().positive()),
    maxProjects: optional(number().int().positive()),
    advancedAnalytics: optional(boolean()),
    apiAccess: optional(boolean()),
    customIntegrations: optional(boolean()),
    sso: optional(boolean()),
    auditLogRetention: optional(number().int().nonnegative()) // days
  })
  .strict();
export type TenantFeatures = z.infer<typeof tenantFeaturesSchema>;

/**
 * Tenant branding settings schema.
 *
 * Customization options for tenant's visual identity.
 * Uses strict mode to reject unknown properties.
 *
 * **Optional Fields:**
 * - `logo`: URL to tenant's logo image (must be valid URL)
 * - `primaryColor`: Hex color code (format: #RRGGBB)
 * - `customDomain`: Custom domain for white-labeling
 * - `customEmail`: Enable custom email domain for notifications
 *
 * @example
 * tenantBrandingSchema.parse({
 *   logo: 'https://example.com/logo.png',
 *   primaryColor: '#FF5733',
 *   customDomain: 'app.mycompany.com',
 *   customEmail: true
 * });
 *
 * // Color validation
 * tenantBrandingSchema.parse({ primaryColor: '#123ABC' }); // ✓
 * tenantBrandingSchema.parse({ primaryColor: '#fff' });    // ✗ Must be 6 digits
 */
export const tenantBrandingSchema = z
  .object({
    logo: optional(string().url()),
    primaryColor: optional(string().regex(/^#[0-9A-Fa-f]{6}$/)),
    customDomain: optional(string()),
    customEmail: optional(boolean())
  })
  .strict();
export type TenantBranding = z.infer<typeof tenantBrandingSchema>;

/**
 * Tenant limits settings schema.
 *
 * Resource consumption limits for a tenant.
 * Uses strict mode to reject unknown properties.
 *
 * **Optional Fields:**
 * - `monthlyBudget`: Monthly spending limit (non-negative number)
 * - `storageQuota`: Storage limit in bytes (non-negative integer)
 * - `apiRateLimit`: API requests per minute (positive integer)
 *
 * @example
 * tenantLimitsSchema.parse({
 *   monthlyBudget: 1000.00,
 *   storageQuota: 10737418240,  // 10 GB in bytes
 *   apiRateLimit: 1000          // 1000 requests/minute
 * });
 */
export const tenantLimitsSchema = z
  .object({
    monthlyBudget: optional(number().nonnegative()),
    storageQuota: optional(number().int().nonnegative()), // bytes
    apiRateLimit: optional(number().int().positive()) // requests per minute
  })
  .strict();
export type TenantLimits = z.infer<typeof tenantLimitsSchema>;

/**
 * Tenant settings JSONB structure schema.
 *
 * Complete settings object stored as JSONB in the database.
 * Combines features, branding, limits, and custom metadata.
 * Uses strict mode to reject unknown top-level properties.
 *
 * **Optional Fields:**
 * - `features`: Feature flags and limits (see tenantFeaturesSchema)
 * - `branding`: Visual customization (see tenantBrandingSchema)
 * - `limits`: Resource limits (see tenantLimitsSchema)
 * - `metadata`: Arbitrary key-value pairs for custom data
 *
 * @example
 * tenantSettingsSchema.parse({
 *   features: {
 *     maxUsers: 100,
 *     sso: true,
 *     apiAccess: true
 *   },
 *   branding: {
 *     primaryColor: '#3366FF',
 *     logo: 'https://cdn.example.com/logo.png'
 *   },
 *   limits: {
 *     apiRateLimit: 5000
 *   },
 *   metadata: {
 *     industry: 'technology',
 *     region: 'us-west'
 *   }
 * });
 */
export const tenantSettingsSchema = z
  .object({
    features: optional(tenantFeaturesSchema),
    branding: optional(tenantBrandingSchema),
    limits: optional(tenantLimitsSchema),
    metadata: optional(z.record(z.string(), z.unknown()))
  })
  .strict();
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

/**
 * Create tenant input schema.
 *
 * Validates input data for creating a new tenant.
 * Uses strict mode to reject unknown properties.
 *
 * **Required Fields:**
 * - `type`: Tenant type (organization, team, or individual)
 *
 * **Optional Fields:**
 * - `status`: Initial status (defaults to undefined, typically 'draft')
 * - `settings`: Initial settings configuration
 *
 * @example
 * // Minimal tenant creation
 * createTenantSchema.parse({ type: 'organization' });
 *
 * // With initial settings
 * createTenantSchema.parse({
 *   type: 'organization',
 *   status: 'trial',
 *   settings: {
 *     features: { maxUsers: 10, apiAccess: true },
 *     branding: { primaryColor: '#007BFF' }
 *   }
 * });
 *
 * // Individual tenant
 * createTenantSchema.parse({
 *   type: 'individual',
 *   settings: { features: { maxProjects: 3 } }
 * });
 */
export const createTenantSchema = z
  .object({
    type: tenantTypeEnum,
    status: optional(tenantStatusEnum),
    settings: optional(tenantSettingsSchema)
  })
  .strict();

/**
 * Update tenant input schema.
 *
 * Validates input data for updating an existing tenant.
 * All fields are optional. Uses strict mode.
 *
 * **Optional Fields:**
 * - `status`: New tenant status
 * - `settings`: Partial settings update (merge behavior handled by service)
 *
 * @example
 * // Update status only
 * updateTenantSchema.parse({ status: 'active' });
 *
 * // Update settings
 * updateTenantSchema.parse({
 *   settings: { features: { maxUsers: 200 } }
 * });
 *
 * // Suspend tenant
 * updateTenantSchema.parse({ status: 'suspended' });
 */
export const updateTenantSchema = z
  .object({
    status: optional(tenantStatusEnum),
    settings: optional(tenantSettingsSchema)
  })
  .strict();

/**
 * User tenant role enumeration schema.
 *
 * Defines roles for user membership within a tenant.
 *
 * **Allowed Values:**
 * - `'owner'`: Full control, can delete tenant, manage billing
 * - `'admin'`: Administrative access, can manage users and settings
 * - `'member'`: Standard access, can use features
 * - `'viewer'`: Read-only access
 *
 * @example
 * userTenantRoleEnum.parse('owner');  // ✓
 * userTenantRoleEnum.parse('admin');  // ✓
 * userTenantRoleEnum.parse('member'); // ✓
 * userTenantRoleEnum.parse('viewer'); // ✓
 */
export const userTenantRoleEnum = z.enum(['owner', 'admin', 'member', 'viewer']);
export type UserTenantRole = z.infer<typeof userTenantRoleEnum>;

/**
 * Create user tenant (membership) input schema.
 *
 * Validates input for adding a user to a tenant.
 * Uses strict mode to reject unknown properties.
 *
 * **Required Fields:**
 * - `userId`: User's numeric ID (positive integer)
 * - `tenantId`: Tenant's numeric ID (positive integer)
 *
 * **Optional Fields:**
 * - `role`: User's role in tenant (defaults to 'member' typically)
 * - `isDefault`: Whether this is user's default tenant
 * - `isActive`: Whether membership is active
 *
 * @example
 * createUserTenantSchema.parse({
 *   userId: 1,
 *   tenantId: 100,
 *   role: 'member',
 *   isDefault: true,
 *   isActive: true
 * });
 *
 * // Minimal (required fields only)
 * createUserTenantSchema.parse({ userId: 1, tenantId: 100 });
 */
export const createUserTenantSchema = z
  .object({
    userId: z.number().int().positive(),
    tenantId: z.number().int().positive(),
    role: optional(userTenantRoleEnum),
    isDefault: optional(boolean()),
    isActive: optional(boolean())
  })
  .strict();

/**
 * Update user tenant (membership) input schema.
 *
 * Validates input for updating a user's tenant membership.
 * All fields are optional. Uses strict mode.
 *
 * **Optional Fields:**
 * - `role`: New role for the user
 * - `isDefault`: Update default tenant preference
 * - `isActive`: Activate or deactivate membership
 *
 * @example
 * // Promote to admin
 * updateUserTenantSchema.parse({ role: 'admin' });
 *
 * // Set as default tenant
 * updateUserTenantSchema.parse({ isDefault: true });
 *
 * // Deactivate membership
 * updateUserTenantSchema.parse({ isActive: false });
 */
export const updateUserTenantSchema = z
  .object({
    role: optional(userTenantRoleEnum),
    isDefault: optional(boolean()),
    isActive: optional(boolean())
  })
  .strict();
