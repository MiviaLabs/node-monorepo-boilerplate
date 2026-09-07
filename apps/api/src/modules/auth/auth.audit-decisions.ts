export const enum AuthAuditDecisionKind {
  Read = 'read',
  Write = 'write',
  Update = 'update',
  Delete = 'delete',
  AccessControl = 'access_control'
}

export const enum AuthAuditDisposition {
  Audit = 'audit',
  Both = 'both',
  Exclude = 'exclude'
}

export type AuthAuditDecision = {
  actionId: string;
  kind: AuthAuditDecisionKind;
  auditDisposition: AuthAuditDisposition;
  rationale: string;
};

export const AUTH_AUDIT_DECISIONS: readonly AuthAuditDecision[] = [
  {
    actionId: 'auth.previewInvitation',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Audit,
    rationale:
      'Reads invitation-scoped tenant and inviter metadata behind a secret token, so successful access is security-relevant even though the response is masked.'
  },
  {
    actionId: 'auth.acceptInvitation',
    kind: AuthAuditDecisionKind.AccessControl,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Consumes an invitation and grants tenant membership, which is an access-control mutation that already emits related tenant events.'
  },
  {
    actionId: 'auth.declineInvitation',
    kind: AuthAuditDecisionKind.AccessControl,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Mutates invitation lifecycle state for tenant access control and already emits related tenant events.'
  },
  {
    actionId: 'auth.register',
    kind: AuthAuditDecisionKind.Write,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Creates authentication and tenant membership state and must be audited alongside its domain event emissions.'
  },
  {
    actionId: 'auth.login',
    kind: AuthAuditDecisionKind.AccessControl,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Establishes an authenticated session boundary and already emits a login domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.loginWithOAuth',
    kind: AuthAuditDecisionKind.AccessControl,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Establishes an authenticated session through a third-party provider and already emits a login domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.loginWithPhone',
    kind: AuthAuditDecisionKind.AccessControl,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Establishes an authenticated session through phone verification and already emits a login domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.refreshToken',
    kind: AuthAuditDecisionKind.Update,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Rotates session credentials and already emits a token refresh domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.logout',
    kind: AuthAuditDecisionKind.Delete,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Revokes active session credentials and already emits a logout domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.linkIdentity',
    kind: AuthAuditDecisionKind.AccessControl,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Adds a new login factor/provider to an account and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.unlinkIdentity',
    kind: AuthAuditDecisionKind.AccessControl,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Removes a login factor/provider from an account and already emits a domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.getUserIdentities',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Audit,
    rationale:
      'Returns linked identity providers and verification posture for an authenticated account, which is sensitive authentication metadata.'
  },
  {
    actionId: 'auth.getUserSessions',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale:
      'The current handler is a stub that returns an empty list without reading persisted protected session state, so there is no sensitive read to audit yet.'
  },
  {
    actionId: 'auth.validateToken',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Audit,
    rationale:
      'Validates a bearer token and returns authenticated subject information, which is a security-relevant protected read.'
  },
  {
    actionId: 'auth.getUserRoles',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Audit,
    rationale:
      'Returns resolved roles and permissions, which is security-relevant authorization posture.'
  },
  {
    actionId: 'auth.getMe',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale:
      'This is a routine self-service bootstrap read of the caller’s own profile and claims; auditing every call would create high-volume noise without privileged access.'
  },
  {
    actionId: 'auth.getMyOrganizations',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale:
      'This is a routine self-service workspace switcher read scoped to the caller’s own memberships rather than privileged or cross-tenant access.'
  },
  {
    actionId: 'auth.updateMe',
    kind: AuthAuditDecisionKind.Update,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Mutates authenticated user profile data and already emits a profile update domain event, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.updateMyAvatar',
    kind: AuthAuditDecisionKind.Update,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Mutates the authenticated user avatar attachment and triggers storage lifecycle cleanup, so it must be audited alongside its profile update domain event.'
  },
  {
    actionId: 'auth.removeMyAvatar',
    kind: AuthAuditDecisionKind.Delete,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Detaches the authenticated user avatar and can schedule the prior avatar file for deletion, so it must be audited alongside its profile update domain event.'
  },
  {
    actionId: 'auth.changeMyPassword',
    kind: AuthAuditDecisionKind.Update,
    auditDisposition: AuthAuditDisposition.Audit,
    rationale:
      'Changes authentication credentials, which is a security-sensitive mutation even when the underlying provider handles the password write.'
  },
  {
    actionId: 'auth.deleteAccount',
    kind: AuthAuditDecisionKind.Delete,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Deletes user or organization account state and already emits domain events, so it also requires audit coverage.'
  },
  {
    actionId: 'auth.exportUserData',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Audit,
    rationale:
      'Exports protected account data for compliance purposes and already persists a compliance audit record.'
  },
  {
    actionId: 'auth.transferOwnership',
    kind: AuthAuditDecisionKind.AccessControl,
    auditDisposition: AuthAuditDisposition.Both,
    rationale:
      'Transfers organization ownership, which is a high-risk access-control mutation that already emits domain and audit events.'
  },
  {
    actionId: 'auth.requestPasswordReset',
    kind: AuthAuditDecisionKind.Write,
    auditDisposition: AuthAuditDisposition.Audit,
    rationale:
      'Creates password reset credentials when an eligible account exists, which is a security-sensitive credential recovery mutation.'
  },
  {
    actionId: 'auth.resetPassword',
    kind: AuthAuditDecisionKind.Update,
    auditDisposition: AuthAuditDisposition.Audit,
    rationale:
      'Completes a credential change through a password reset token, which is a security-sensitive authentication mutation.'
  },
  {
    actionId: 'auth.validatePasswordResetToken',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale:
      'This is an unauthenticated high-frequency preflight check that returns only coarse token state and would cause audit amplification without stable actor identity.'
  },
  {
    actionId: 'authTest.getAdminDashboard',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale: 'Test-only controller endpoint restricted to non-production environments.'
  },
  {
    actionId: 'authTest.createPost',
    kind: AuthAuditDecisionKind.Write,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale: 'Test-only controller endpoint restricted to non-production environments.'
  },
  {
    actionId: 'authTest.deletePost',
    kind: AuthAuditDecisionKind.Delete,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale: 'Test-only controller endpoint restricted to non-production environments.'
  },
  {
    actionId: 'authTest.getPosts',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale: 'Test-only controller endpoint restricted to non-production environments.'
  },
  {
    actionId: 'authTest.getTenant',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale: 'Test-only controller endpoint restricted to non-production environments.'
  },
  {
    actionId: 'authTest.getEmail',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale: 'Test-only controller endpoint restricted to non-production environments.'
  },
  {
    actionId: 'authTest.getActor',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale: 'Test-only controller endpoint restricted to non-production environments.'
  },
  {
    actionId: 'authTest.getUserId',
    kind: AuthAuditDecisionKind.Read,
    auditDisposition: AuthAuditDisposition.Exclude,
    rationale: 'Test-only controller endpoint restricted to non-production environments.'
  }
] as const;
