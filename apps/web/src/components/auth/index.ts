/**
 * @module WebAuthComponents
 * @description Authentication UI components including login, registration forms, and password validation.
 */

export { LoginForm } from './login-form';
export { RegisterForm } from './register-form';
export { ExistingAccountInvitationPanel } from './existing-account-invitation-panel';
export { AuthPageShell } from './auth-page-shell';
export { AuthShell, AuthShellContentWidth } from './auth-shell';
export { AuthPageShellFlexy } from './flexy/auth-page-shell-flexy';
export { PasswordStrengthIndicator } from './password-strength';
export { ForgotPasswordForm } from './forgot-password-form';
export { ResetPasswordForm } from './reset-password-form';
export { loginSchema, registerSchema } from './auth-validation';
export type {
  LoginFormData,
  RegisterFormData,
  ForgotPasswordFormData,
  ResetPasswordFormData
} from './auth-validation';
export type { PasswordStrength } from './password-strength';
