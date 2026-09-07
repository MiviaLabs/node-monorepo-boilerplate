/**
 * @module AuthDtos
 * @description Data transfer objects for authentication requests and responses.
 */

export { RegisterDto } from './register.dto';
export { LoginDto } from './login.dto';
export { LoginWithOAuthDto } from './login-with-oauth.dto';
export { LoginWithPhoneDto } from './login-with-phone.dto';
export { LinkIdentityDto } from './link-identity.dto';
export { UnlinkIdentityDto } from './unlink-identity.dto';
export { RefreshTokenDto } from './refresh-token.dto';
export { AuthResponseDto } from './auth-response.dto';
export { SessionDto, type SessionEntity } from './session.dto';
export { UserIdentityDto } from './user-identity.dto';
export { UserRolesResponseDto } from './user-roles-response.dto';
export { UserProfileResponseDto } from './user-profile-response.dto';
export { UserOrganizationDto } from './user-organization.dto';
export { AuthBootstrapResponseDto } from './auth-bootstrap-response.dto';
export { UpdateMyProfileDto } from './update-my-profile.dto';
export { UpdateMyAvatarDto } from './update-my-avatar.dto';
export { ChangeMyPasswordDto } from './change-my-password.dto';
export { InvitationPreviewQueryDto, InvitationPreviewResponseDto } from './invitation-preview.dto';
export { InvitationActionDto, InvitationActionResponseDto } from './invitation-action.dto';
export { RequestPasswordResetDto } from './request-password-reset.dto';
export { ResetPasswordDto } from './reset-password.dto';
export {
  CurrentUserSettingsResponseDto,
  CurrentUserSettingKeyParamDto,
  UpdateCurrentUserSettingDto
} from './current-user-settings.dto';
