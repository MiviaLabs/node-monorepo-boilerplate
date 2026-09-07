/**
 * @module AuthCommandHandlers
 * @description Command handlers for authentication operations including login, registration, and account management.
 */

export { RegisterHandler } from './register.handler';
export { LoginHandler } from './login.handler';
export { LoginWithOAuthHandler } from './login-with-oauth.handler';
export { LoginWithPhoneHandler } from './login-with-phone.handler';
export { LinkIdentityHandler } from './link-identity.handler';
export { UnlinkIdentityHandler } from './unlink-identity.handler';
export { LogoutHandler } from './logout.handler';
export { RevokeSessionHandler } from './revoke-session.handler';
export { RefreshTokenHandler } from './refresh-token.handler';
export { DeleteAccountHandler } from './delete-account.handler';
export { ExportUserDataHandler } from './export-user-data.handler';
export { TransferOwnershipHandler } from './transfer-ownership.handler';
export { UpdateMyProfileHandler } from './update-my-profile.handler';
export { UpdateMyAvatarHandler } from './update-my-avatar.handler';
export { RemoveMyAvatarHandler } from './remove-my-avatar.handler';
export { ChangeMyPasswordHandler } from './change-my-password.handler';
export { AcceptInvitationHandler } from './accept-invitation.handler';
export { DeclineInvitationHandler } from './decline-invitation.handler';
export { UpdateCurrentUserSettingHandler } from './update-current-user-setting.handler';
