/**
 * @module AuthCommands
 * @description CQRS commands for authentication operations including login, registration, and account management.
 */

export { RegisterCommand } from './register.command';
export { LoginCommand } from './login.command';
export { LoginWithOAuthCommand } from './login-with-oauth.command';
export { LoginWithPhoneCommand } from './login-with-phone.command';
export { LinkIdentityCommand } from './link-identity.command';
export { UnlinkIdentityCommand } from './unlink-identity.command';
export { LogoutCommand } from './logout.command';
export { RevokeSessionCommand } from './revoke-session.command';
export { RefreshTokenCommand } from './refresh-token.command';
export { DeleteAccountCommand } from './delete-account.command';
export { ExportUserDataCommand } from './export-user-data.command';
export { TransferOwnershipCommand } from './transfer-ownership.command';
export { UpdateMyProfileCommand } from './update-my-profile.command';
export { UpdateMyAvatarCommand } from './update-my-avatar.command';
export { RemoveMyAvatarCommand } from './remove-my-avatar.command';
export { ChangeMyPasswordCommand } from './change-my-password.command';
export { RequestPasswordResetCommand } from './request-password-reset.command';
export { ResetPasswordCommand } from './reset-password.command';
export { AcceptInvitationCommand } from './accept-invitation.command';
export { DeclineInvitationCommand } from './decline-invitation.command';
export { UpdateCurrentUserSettingCommand } from './update-current-user-setting.command';
