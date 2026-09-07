'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { FormEvent } from 'react';

import { PasswordStrengthIndicator } from '~/components/auth/password-strength';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { useAuth } from '~/hooks/use-auth';
import {
  getTransition,
  getVariants,
  iconSwapTransition,
  iconSwapVariants,
  standardTransition
} from '~/lib/motion';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]+$/;

function getPasswordValidationError(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): string | null {
  const current = currentPassword.trim();
  const next = newPassword.trim();
  const confirm = confirmPassword.trim();

  if (!current || !next || !confirm) {
    return 'All password fields are required';
  }
  if (current.length < PASSWORD_MIN_LENGTH || current.length > PASSWORD_MAX_LENGTH) {
    return `Current password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`;
  }
  if (next.length < PASSWORD_MIN_LENGTH || next.length > PASSWORD_MAX_LENGTH) {
    return `New password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`;
  }
  if (!PASSWORD_PATTERN.test(next)) {
    return 'New password must contain uppercase, lowercase, number, and special character';
  }
  if (current === next) {
    return 'New password must be different from current password';
  }
  if (next !== confirm) {
    return 'New password and confirmation do not match';
  }
  return null;
}

export function ChangePasswordForm() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const validationError = useMemo(
    () => getPasswordValidationError(currentPassword, newPassword, confirmPassword),
    [currentPassword, newPassword, confirmPassword]
  );
  const inlineMessageVariants = getVariants({
    initial: { opacity: 0, y: -4, filter: 'blur(2px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -3, filter: 'blur(2px)' }
  });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSubmitted(true);

    const formData = new FormData(event.currentTarget);
    const submittedCurrentPassword = String(formData.get('currentPassword') ?? '');
    const submittedNewPassword = String(formData.get('newPassword') ?? '');
    const submittedConfirmPassword = String(formData.get('confirmPassword') ?? '');

    setCurrentPassword(submittedCurrentPassword);
    setNewPassword(submittedNewPassword);
    setConfirmPassword(submittedConfirmPassword);

    const submitValidationError = getPasswordValidationError(
      submittedCurrentPassword,
      submittedNewPassword,
      submittedConfirmPassword
    );

    if (submitValidationError) {
      if (submitValidationError === 'New password and confirmation do not match') {
        toast.error('Passwords do not match', {
          description: submitValidationError
        });
      } else {
        toast.error('Please fix validation errors', {
          description: submitValidationError
        });
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/me/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: submittedCurrentPassword.trim(),
          newPassword: submittedNewPassword.trim()
        })
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => ({ message: 'Failed to change password' }))) as { message?: string };
        throw new Error(payload.message ?? 'Failed to change password');
      }

      toast.message('Password changed. Please sign in again.');
      await logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      toast.error('Password change failed', {
        description: message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card
      className={`${enterpriseCardVariants()} animate-in fade-in-0 slide-in-from-bottom-1 duration-300`}
    >
      <CardHeader>
        <CardTitle className="text-base">Change Password</CardTitle>
        <CardDescription>
          Update your password for account security. You will be signed out after success.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              maxLength={PASSWORD_MAX_LENGTH}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              maxLength={PASSWORD_MAX_LENGTH}
              disabled={isSubmitting}
            />
            <AnimatePresence initial={false}>
              {newPassword ? (
                <motion.div
                  key="password-strength"
                  variants={inlineMessageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={getTransition(standardTransition)}
                >
                  <PasswordStrengthIndicator password={newPassword} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              maxLength={PASSWORD_MAX_LENGTH}
              disabled={isSubmitting}
            />
            <AnimatePresence initial={false}>
              {hasSubmitted && newPassword.trim() !== confirmPassword.trim() ? (
                <motion.p
                  key="password-mismatch"
                  className="text-sm font-medium text-red-600 dark:text-red-400"
                  variants={inlineMessageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={getTransition(standardTransition)}
                >
                  New password and confirmation do not match
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <AnimatePresence initial={false}>
            {hasSubmitted &&
            validationError &&
            validationError !== 'New password and confirmation do not match' ? (
              <motion.p
                key="password-validation"
                className="text-sm font-medium text-red-600 dark:text-red-400"
                variants={inlineMessageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={getTransition(standardTransition)}
              >
                {validationError}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              For security, you’ll be signed out after a successful password update.
            </p>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              <AnimatePresence mode="wait" initial={false}>
                {isSubmitting ? (
                  <motion.span
                    key="updating-password-icon"
                    variants={getVariants(iconSwapVariants)}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={getTransition(iconSwapTransition)}
                    className="mr-2 inline-flex"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="change-password-icon"
                    variants={getVariants(iconSwapVariants)}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={getTransition(iconSwapTransition)}
                    className="mr-2 inline-flex"
                  >
                    <KeyRound className="h-4 w-4" />
                  </motion.span>
                )}
              </AnimatePresence>
              {isSubmitting ? 'Updating...' : 'Update password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
