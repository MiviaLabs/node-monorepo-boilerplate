export interface AdminApiEnvelope<T> {
  data: T;
}

export interface AdminSession {
  id: string;
  userId: number;
  tenantId: string;
  tokenId: string;
  createdAt: string;
  expiresAt: string;
  lastActivity: string;
  active: boolean;
}

export const enum AdminHealthStatus {
  Ok = 'ok',
  Degraded = 'degraded',
  Error = 'error',
  Unknown = 'unknown'
}

export const enum AdminIncidentPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high'
}

export const enum AdminIncidentState {
  Open = 'open',
  Monitoring = 'monitoring',
  Resolved = 'resolved'
}

export interface AdminHealthService {
  key: string;
  label: string;
  status: AdminHealthStatus;
  summary?: string;
  checkedAt?: string;
}

export interface AdminHealthMetric {
  key: string;
  label: string;
  value: number;
  summary?: string;
}

export interface AdminHealthIncident {
  id: string;
  kind: string;
  priority: AdminIncidentPriority;
  summary: string;
  state: AdminIncidentState;
  occurredAt: string;
}

export interface AdminHealthOverview {
  generatedAt: string;
  overallStatus: AdminHealthStatus;
  metrics: AdminHealthMetric[];
  services: AdminHealthService[];
  incidents: AdminHealthIncident[];
}

export interface AdminStatisticMetric {
  key: string;
  label: string;
  value: number;
  unit?: string;
  summary?: string;
}

export interface AdminPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AdminStatisticsOverview {
  generatedAt: string;
  metrics: AdminStatisticMetric[];
  eventDeliverySeries: Array<{
    label: string;
    published: number;
    retries: number;
    deadLetters: number;
  }>;
  volumeBreakdown: Array<{
    key: string;
    label: string;
    value: number;
  }>;
  deliveryStateRollup: Array<{
    status: string;
    value: number;
    fill: string;
  }>;
  summaryRows: Array<{
    group: string;
    total: number;
    detail: string;
    source: string;
  }>;
  deletionSummary?: AdminDeletionSummary;
  outboxSummary?: AdminStatisticsOutboxSummary;
}

export const enum AdminOutboxStatus {
  Pending = 'pending',
  Processing = 'processing',
  Published = 'published',
  Failed = 'failed'
}

export interface AdminOutboxMetric {
  key: string;
  label: string;
  value: number;
  summary?: string;
}

export interface AdminOutboxDeliveryStateRollup {
  status: string;
  value: number;
  fill: string;
}

export interface AdminOutboxHighlights {
  oldestPendingAgeMinutes: number;
  nextRetryAt?: string;
  retryableNow: number;
}

export interface AdminOutboxSummary {
  generatedAt: string;
  metrics: AdminOutboxMetric[];
  deliveryStateRollup: AdminOutboxDeliveryStateRollup[];
  highlights: AdminOutboxHighlights;
}

export interface AdminStatisticsOutboxSummary {
  pending: number;
  processing: number;
  published: number;
  failed: number;
  retryable: number;
  deadLettered: number;
  highlights: AdminOutboxHighlights;
}

export interface AdminOutboxItem {
  eventId: string;
  eventType: string;
  aggregateId: string;
  tenantId: string;
  status: AdminOutboxStatus;
  retryCount: number;
  isRetryable: boolean;
  isDeadLettered: boolean;
  ageSeconds: number;
  createdAt: string;
  publishedAt?: string;
  lastRetryAt?: string;
  nextRetryAt?: string;
  deadLetteredAt?: string;
  deadLetterReason?: string;
  errorSummary?: string;
  payloadKeys?: string[];
  payloadSizeBytes?: number;
  correlationId?: string;
  causationId?: string;
}

export interface AdminOutboxOverview {
  generatedAt: string;
  metrics: AdminOutboxMetric[];
  summary: AdminStatisticsOutboxSummary & { total: number };
  items: AdminOutboxItem[];
  pagination: AdminPagination;
}

export interface AdminEmailMetric {
  key: string;
  label: string;
  value: number;
  summary?: string;
}

export interface AdminEmailSummaryCounts {
  total: number;
  pending: number;
  accepted: number;
  delivered: number;
  failedOrBouncedOrComplained: number;
  webhookAttention: number;
}

export interface AdminEmailSummary {
  generatedAt: string;
  metrics: AdminEmailMetric[];
  summary: AdminEmailSummaryCounts;
}

export const enum AdminEmailWebhookAttentionState {
  Clear = 'clear',
  Attention = 'attention'
}

export interface AdminEmailSafeMetadataSummary {
  templateKey?: string;
  tagCount?: number;
  headerKeys?: string[];
  providerHintKeys?: string[];
}

export interface AdminEmailItem {
  emailMessageId: number;
  publicId: string;
  organizationId: number;
  organizationName: string;
  referenceType?: string;
  referenceId?: string;
  subject?: string;
  messageStatus: string;
  provider?: string;
  attemptNumber?: number;
  providerMessageId?: string;
  providerDeliveryId?: string;
  providerEventId?: string;
  providerStatus?: string;
  normalizedProviderStatus?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  lastWebhookOccurredAt?: string;
  lastWebhookAt?: string;
  failedWebhookCount: number;
  unmatchedWebhookCount: number;
  latestWebhookProcessingStatus?: string;
  webhookAttentionState: `${AdminEmailWebhookAttentionState}`;
  correlationId?: string;
  safeMetadataSummary?: AdminEmailSafeMetadataSummary;
}

export interface AdminEmailsOverview extends AdminEmailSummary {
  items: AdminEmailItem[];
  pagination: AdminPagination;
}

export interface AdminEmailProviderAttempt {
  id: number;
  provider: string;
  attemptNumber: number;
  providerMessageId?: string;
  providerDeliveryId?: string;
  providerEventId?: string;
  providerStatus?: string;
  normalizedProviderStatus?: string;
  correlationId?: string;
  acceptedAt?: string;
  lastWebhookOccurredAt?: string;
  lastWebhookAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminEmailRelatedWebhookEvent {
  id: number;
  provider: string;
  providerEventType: string;
  normalizedEventType: string;
  verificationStatus: string;
  processingStatus: string;
  providerMessageId?: string;
  providerDeliveryId?: string;
  providerEventId?: string;
  emailProviderMessageId?: number;
  attemptCount: number;
  processingError?: string;
  occurredAt?: string;
  receivedAt: string;
  processedAt?: string;
}

export interface AdminEmailDetail {
  generatedAt: string;
  item: AdminEmailItem;
  providerAttempts: AdminEmailProviderAttempt[];
  relatedWebhookEvents: AdminEmailRelatedWebhookEvent[];
}

export interface AdminEmailWebhookSummary {
  generatedAt: string;
  totalEvents: number;
  appliedEvents: number;
  unmatchedEvents: number;
  failedEvents: number;
  pendingEvents: number;
  retryableEvents: number;
  latestReceivedAt?: string;
}

export interface AdminEmailWebhookEventItem {
  id: number;
  provider: string;
  providerEventType: string;
  normalizedEventType: string;
  processingStatus: string;
  verificationStatus: string;
  providerMessageId?: string;
  providerDeliveryId?: string;
  providerEventId?: string;
  organizationId?: number;
  organizationName?: string;
  emailMessageId?: number;
  emailProviderMessageId?: number;
  messageStatus?: string;
  latestProviderStatus?: string;
  latestNormalizedProviderStatus?: string;
  referenceType?: string;
  referenceId?: string;
  attemptCount: number;
  processingError?: string;
  occurredAt?: string;
  receivedAt: string;
  processedAt?: string;
}

export interface AdminEmailWebhookEventList {
  page: number;
  pageSize: number;
  total: number;
  items: AdminEmailWebhookEventItem[];
}

export interface AdminReprocessEmailWebhookResult {
  webhookEventId: number;
  processingStatus: string;
  attemptCount: number;
  reprocessed: boolean;
}

export const enum AdminDeadLetterReason {
  Network = 'network',
  Timeout = 'timeout',
  Validation = 'validation',
  Permission = 'permission',
  Unknown = 'unknown'
}

export interface AdminDeadLetterEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  tenantId?: string;
  retryCount: number;
  errorMessage: string;
  deadLetteredAt: string;
  reason: AdminDeadLetterReason;
}

export interface AdminStartEventReplayInput {
  aggregateId?: string;
  tenantId?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  maxEvents?: number;
}

export interface AdminStartEventReplayResponse {
  replayId: string;
  status: string;
}

export interface AdminEventReplayStatus {
  replayId: string;
  status: string;
  processedCount: number;
  totalCount: number;
  successCount: number;
  failureCount: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface AdminCancelEventReplayResponse {
  success: boolean;
  message: string;
}

export const enum AdminDeletionEntityType {
  User = 'user',
  Organization = 'organization'
}

export const enum AdminDeletionProviderCleanupState {
  Pending = 'pending',
  NotApplicable = 'not_applicable',
  Unknown = 'unknown'
}

export interface AdminDeletionSummary {
  totalPending: number;
  pendingUsers: number;
  pendingOrganizations: number;
  dueWithin7Days: number;
  overdueCount: number;
  retentionDays: number;
}

export interface AdminDeletionMetric {
  key: string;
  label: string;
  value: number;
  summary?: string;
}

export interface AdminDeletionAgeBucket {
  key: string;
  label: string;
  value: number;
}

export interface AdminDeletionQueueItem {
  entityType: AdminDeletionEntityType;
  entityId: number;
  organizationId?: number;
  displayLabel: string;
  secondaryLabel?: string;
  deletedAt: string;
  purgeDueAt: string;
  daysUntilPurge: number;
  isOverdue: boolean;
  providerCleanupState: AdminDeletionProviderCleanupState;
  providerContext?: string;
  detailHref?: string;
}

export interface AdminDeletionQueueOverview {
  generatedAt: string;
  retentionDays: number;
  purgeCron: string;
  dryRun: boolean;
  metrics: AdminDeletionMetric[];
  summary: AdminDeletionSummary;
  ageBuckets: AdminDeletionAgeBucket[];
  items: AdminDeletionQueueItem[];
  pagination: AdminPagination;
}

export interface AdminTenantInventoryItem {
  organizationId: number;
  tenantId: number;
  publicId: string;
  name: string;
  displayName?: string;
  slug: string;
  tenantType: AdminTenantType;
  status: AdminTenantStatus;
  organizationActive: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  ownerUserId?: number;
  ownerDisplayName?: string;
  ownerActive?: boolean;
  hasOwner: boolean;
  memberCount: number;
  adminCount: number;
  pendingInvitationCount: number;
  gcpTenantId?: string;
  hasProvisionedAuthTenant: boolean;
  onboardingState: AdminTenantOnboardingState;
  diagnostics: AdminTenantDiagnostics;
  createdAt: string;
  updatedAt: string;
}

export const enum AdminTenantType {
  Organization = 'organization',
  Team = 'team',
  Individual = 'individual'
}

export const enum AdminTenantStatus {
  Draft = 'draft',
  Trial = 'trial',
  Active = 'active',
  Suspended = 'suspended',
  Deleted = 'deleted'
}

export const enum AdminTenantOnboardingState {
  Setup = 'setup',
  Provisioning = 'provisioning',
  Invited = 'invited',
  Ready = 'ready',
  Attention = 'attention',
  Archived = 'archived'
}

export interface AdminTenantDiagnostics {
  ssoEnabled: boolean;
  apiAccessEnabled: boolean;
  hasCustomDomain: boolean;
  hasCustomEmail: boolean;
  maxUsers?: number;
  apiRateLimit?: number;
}

export interface AdminTenantMetric {
  key: string;
  label: string;
  value: number;
  summary?: string;
}

export interface AdminTenantsOverview {
  generatedAt: string;
  metrics: AdminTenantMetric[];
  items: AdminTenantInventoryItem[];
  pagination: AdminPagination;
}

export interface AdminTenantOwner {
  userId: number;
  displayName?: string;
  membershipRole: string;
  isActive: boolean;
  isDeleted: boolean;
  isDefault?: boolean;
  isDesignatedOwner: boolean;
  primaryIdentityProvider?: string;
  emailVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTenantIdentityProviderCount {
  provider: string;
  count: number;
}

export interface AdminTenantInvitationStatusCount {
  status: string;
  count: number;
}

export interface AdminTenantMembershipStats {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  ownerCount: number;
  adminCount: number;
  elevatedAccessCount: number;
}

export interface AdminTenantFeatureSettings {
  maxUsers?: number;
  maxProjects?: number;
  advancedAnalytics?: boolean;
  apiAccess?: boolean;
  customIntegrations?: boolean;
  sso?: boolean;
  auditLogRetention?: number;
}

export interface AdminTenantBrandingSettings {
  logo?: string;
  primaryColor?: string;
  customDomain?: string;
  customEmail?: boolean;
}

export interface AdminTenantLimitSettings {
  monthlyBudget?: number;
  storageQuota?: number;
  apiRateLimit?: number;
}

export interface AdminTenantSettingsSnapshot {
  features?: AdminTenantFeatureSettings;
  branding?: AdminTenantBrandingSettings;
  limits?: AdminTenantLimitSettings;
  metadata?: Record<string, unknown>;
}

export interface AdminTenantAuthPosture {
  authProvider?: string;
  hasProvisionedAuthTenant: boolean;
  gcpTenantId?: string;
  ssoEnabled: boolean;
  apiAccessEnabled: boolean;
  providersInUse: AdminTenantIdentityProviderCount[];
}

export interface AdminTenantDetail {
  generatedAt: string;
  organizationId: number;
  tenantId: number;
  publicId: string;
  tenantPublicId: string;
  name: string;
  displayName?: string;
  slug: string;
  tenantType: AdminTenantType;
  status: AdminTenantStatus;
  onboardingState: AdminTenantOnboardingState;
  organizationActive: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  ownerUserId?: number;
  ownerDisplayName?: string;
  hasOwner: boolean;
  createdAt: string;
  updatedAt: string;
  diagnostics: AdminTenantDiagnostics;
  membership: AdminTenantMembershipStats;
  invitationStatusCounts: AdminTenantInvitationStatusCount[];
  owners: AdminTenantOwner[];
  auth: AdminTenantAuthPosture;
  settings: AdminTenantSettingsSnapshot;
}

export interface AdminAccessMembership {
  userId: number;
  organizationId?: number;
  organizationName?: string;
  organizationDisplayName?: string;
  organizationSlug?: string;
  organizationActive?: boolean;
  organizationDeletedAt?: string;
  tenantId: number;
  tenantType: AdminTenantType;
  tenantStatus: AdminTenantStatus;
  displayName?: string;
  userLifecycle?: AdminUserLifecycle;
  userActive?: boolean;
  userDeletedAt?: string;
  membershipRole: string;
  status: AdminAccessMembershipStatus;
  isDefault: boolean;
  isPrivileged: boolean;
  systemRoles: string[];
  createdAt: string;
  updatedAt: string;
}

export const enum AdminAccessMembershipStatus {
  Active = 'active',
  Inactive = 'inactive',
  Suspended = 'suspended',
  Pending = 'pending',
  Deleted = 'deleted'
}

export interface AdminAccessInvitation {
  invitationId: number;
  organizationId: number;
  organizationName: string;
  organizationDisplayName?: string;
  organizationSlug: string;
  tenantId: number;
  tenantType: AdminTenantType;
  role: string;
  status: AdminAccessInvitationStatus;
  invitedByUserId?: number;
  invitedByDisplayName?: string;
  isPrivileged: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface AdminAccessMetric {
  key: string;
  label: string;
  value: number;
  summary?: string;
}

export const enum AdminAccessInvitationStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Expired = 'expired',
  Cancelled = 'cancelled'
}

export interface AdminAccessOverview {
  generatedAt: string;
  metrics: AdminAccessMetric[];
  memberships: AdminAccessMembership[];
  membershipsPagination: AdminPagination;
  invitations: AdminAccessInvitation[];
  invitationsPagination: AdminPagination;
}

export interface AdminMemberIdentity {
  provider?: string;
  providerDisplayName?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  hasPrimaryIdentity: boolean;
}

export interface AdminMemberMembershipSummary {
  organizationId?: number;
  organizationName?: string;
  organizationDisplayName?: string;
  organizationSlug?: string;
  tenantId: number;
  tenantType: AdminTenantType;
  tenantStatus: AdminTenantStatus;
  membershipRole: string;
  status: AdminAccessMembershipStatus;
  isPrivileged: boolean;
  isDefault: boolean;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMemberMembershipStats {
  totalMemberships: number;
  activeMemberships: number;
  suspendedMemberships: number;
  privilegedMemberships: number;
}

export interface AdminMemberDetail {
  generatedAt: string;
  userId: number;
  organizationId?: number;
  organizationName?: string;
  organizationDisplayName?: string;
  organizationSlug?: string;
  organizationActive?: boolean;
  organizationDeletedAt?: string;
  tenantId: number;
  tenantType: AdminTenantType;
  tenantStatus: AdminTenantStatus;
  displayName?: string;
  photoUrl?: string;
  membershipRole: string;
  status: AdminAccessMembershipStatus;
  userLifecycle: AdminUserLifecycle;
  userActive: boolean;
  userVerified: boolean;
  userDeletedAt?: string;
  systemRoles: string[];
  isPrivileged: boolean;
  isDefault: boolean;
  userCreatedAt: string;
  userUpdatedAt: string;
  lastSignInAt?: string;
  membershipCreatedAt: string;
  membershipUpdatedAt: string;
  identity: AdminMemberIdentity;
  membershipStats: AdminMemberMembershipStats;
  otherMemberships: AdminMemberMembershipSummary[];
}

export const enum AdminUserLifecycle {
  Active = 'active',
  Deleted = 'deleted'
}

export interface AdminUserMetric {
  key: string;
  label: string;
  value: number;
  summary?: string;
}

export interface AdminUserInventoryItem {
  userId: number;
  organizationId?: number;
  organizationName?: string;
  organizationDisplayName?: string;
  organizationSlug?: string;
  displayName?: string;
  photoUrl?: string;
  primaryIdentityProvider?: string;
  hasPrimaryIdentity: boolean;
  defaultTenantId?: number;
  defaultTenantStatus?: AdminTenantStatus;
  userLifecycle: AdminUserLifecycle;
  userActive: boolean;
  userVerified: boolean;
  userDeletedAt?: string;
  systemRoles: string[];
  isPrivileged: boolean;
  membershipCount: number;
  activeMembershipCount: number;
  privilegedMembershipCount: number;
  createdAt: string;
  updatedAt: string;
  lastSignInAt?: string;
}

export interface AdminUsersOverview {
  generatedAt: string;
  metrics: AdminUserMetric[];
  users: AdminUserInventoryItem[];
  pagination: AdminPagination;
}

export interface AdminUserIdentitySummary {
  provider?: string;
  providerDisplayName?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  hasPrimaryIdentity: boolean;
  providersInUse: string[];
  totalIdentities: number;
}

export interface AdminUserMembershipSummary {
  organizationId?: number;
  organizationName?: string;
  organizationDisplayName?: string;
  organizationSlug?: string;
  tenantId: number;
  tenantType: AdminTenantType;
  tenantStatus: AdminTenantStatus;
  membershipRole: string;
  status: AdminAccessMembershipStatus;
  isPrivileged: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserMembershipStats {
  totalMemberships: number;
  activeMemberships: number;
  suspendedMemberships: number;
  privilegedMemberships: number;
}

export interface AdminUserDetail {
  generatedAt: string;
  userId: number;
  organizationId?: number;
  organizationName?: string;
  organizationDisplayName?: string;
  organizationSlug?: string;
  organizationActive?: boolean;
  organizationDeletedAt?: string;
  displayName?: string;
  photoUrl?: string;
  userLifecycle: AdminUserLifecycle;
  userActive: boolean;
  userVerified: boolean;
  userDeletedAt?: string;
  systemRoles: string[];
  isPrivileged: boolean;
  userCreatedAt: string;
  userUpdatedAt: string;
  lastSignInAt?: string;
  identity: AdminUserIdentitySummary;
  membershipStats: AdminUserMembershipStats;
  memberships: AdminUserMembershipSummary[];
}

export interface AdminInboxItem {
  id: string;
  kind: string;
  priority: AdminIncidentPriority;
  title: string;
  summary: string;
  createdAt: string;
  href?: string;
}

export interface AdminInboxOverview {
  generatedAt: string;
  items: AdminInboxItem[];
}
