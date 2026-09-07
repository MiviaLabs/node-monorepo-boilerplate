import {
  AUTH_AUDIT_DECISIONS,
  AuthAuditDecisionKind,
  AuthAuditDisposition
} from '../auth.audit-decisions';

describe('AUTH_AUDIT_DECISIONS', () => {
  it('documents every auth-module action with an explicit audit decision', () => {
    expect(AUTH_AUDIT_DECISIONS.map((entry) => entry.actionId)).toEqual([
      'auth.previewInvitation',
      'auth.acceptInvitation',
      'auth.declineInvitation',
      'auth.register',
      'auth.login',
      'auth.loginWithOAuth',
      'auth.loginWithPhone',
      'auth.refreshToken',
      'auth.logout',
      'auth.linkIdentity',
      'auth.unlinkIdentity',
      'auth.getUserIdentities',
      'auth.getUserSessions',
      'auth.validateToken',
      'auth.getUserRoles',
      'auth.getMe',
      'auth.getMyOrganizations',
      'auth.updateMe',
      'auth.updateMyAvatar',
      'auth.removeMyAvatar',
      'auth.changeMyPassword',
      'auth.deleteAccount',
      'auth.exportUserData',
      'auth.transferOwnership',
      'auth.requestPasswordReset',
      'auth.resetPassword',
      'auth.validatePasswordResetToken',
      'authTest.getAdminDashboard',
      'authTest.createPost',
      'authTest.deletePost',
      'authTest.getPosts',
      'authTest.getTenant',
      'authTest.getEmail',
      'authTest.getActor',
      'authTest.getUserId'
    ]);
  });

  it('defaults every mutating auth action to audit or both unless it is test-only', () => {
    const mutatingActions = AUTH_AUDIT_DECISIONS.filter(
      (entry) =>
        entry.kind !== AuthAuditDecisionKind.Read && !entry.actionId.startsWith('authTest.')
    );

    expect(
      mutatingActions.every((entry) => entry.auditDisposition !== AuthAuditDisposition.Exclude)
    ).toBe(true);
  });

  it('only audits reads that are sensitive, security-relevant, compliance-relevant, or token-scoped', () => {
    const auditedReads = AUTH_AUDIT_DECISIONS.filter(
      (entry) =>
        entry.kind === AuthAuditDecisionKind.Read &&
        entry.auditDisposition === AuthAuditDisposition.Audit
    ).map((entry) => entry.actionId);

    expect(auditedReads).toEqual([
      'auth.previewInvitation',
      'auth.getUserIdentities',
      'auth.validateToken',
      'auth.getUserRoles',
      'auth.exportUserData'
    ]);
  });
});
