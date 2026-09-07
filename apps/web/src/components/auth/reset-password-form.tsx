'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { resetPasswordFormSchema, type ResetPasswordFormData } from './auth-validation';
import { PasswordStrengthIndicator } from './password-strength';

import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '~/components/ui/card';
import {
  enterpriseInputClass,
  enterprisePrimaryButtonClass
} from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { authApi } from '~/lib/api/auth-api';
import {
  celebrationVariants,
  iconSwapTransition,
  iconSwapVariants,
  standardTransition
} from '~/lib/motion';
import { PasswordResetTokenStatus, type PasswordResetTokenValidation } from '~/types/auth.types';

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  const [tokenState, setTokenState] = useState<PasswordResetTokenValidation | null>(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const linkClassName =
    'font-medium text-foreground/90 underline-offset-4 transition-colors hover:text-foreground hover:underline';

  const {
    register,
    handleSubmit,
    watch,
    setError,
    clearErrors,
    formState: { errors }
  } = useForm<ResetPasswordFormData>({
    defaultValues: {
      newPassword: '',
      confirmPassword: ''
    }
  });

  const newPassword = watch('newPassword');

  useEffect(() => {
    let mounted = true;
    const validate = async () => {
      setIsValidatingToken(true);
      try {
        const response = await authApi.validatePasswordResetToken(token);
        if (mounted) {
          setTokenState(response);
        }
      } catch {
        if (mounted) {
          setTokenState({ isValid: false, status: PasswordResetTokenStatus.NOT_FOUND });
        }
      } finally {
        if (mounted) {
          setIsValidatingToken(false);
        }
      }
    };
    void validate();
    return () => {
      mounted = false;
    };
  }, [token]);

  const onSubmit = async (data: ResetPasswordFormData) => {
    clearErrors();
    const validation = resetPasswordFormSchema.safeParse(data);
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if (field === 'newPassword' || field === 'confirmPassword') {
          setError(field, { type: 'manual', message: issue.message });
        }
      }
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({
        token,
        newPassword: validation.data.newPassword,
        confirmPassword: validation.data.confirmPassword
      });
      setShowSuccessAnimation(true);
      toast.success('Password reset successful', {
        description: 'You can now sign in with your new password.'
      });
      // Delay navigation to show success animation
      setTimeout(() => {
        router.push('/login');
      }, 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reset password';
      setError('root', { type: 'server', message });
      toast.error('Reset failed', { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isValidatingToken ? (
        <motion.div
          key="validating-token"
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
          transition={standardTransition}
        >
          <Card className="motion-enter-soft premium-panel w-full max-w-md rounded-lg border-border/70">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </motion.div>
      ) : !tokenState?.isValid ? (
        <motion.div
          key="invalid-token"
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
          transition={standardTransition}
        >
          <Card className="motion-enter-soft premium-panel w-full max-w-md rounded-lg border-border/70">
            <CardHeader className="space-y-1 pb-5">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
                CREDENTIAL RECOVERY
              </p>
              <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
                {tokenState?.status === PasswordResetTokenStatus.EXPIRED
                  ? 'Recovery link expired'
                  : tokenState?.status === PasswordResetTokenStatus.USED
                    ? 'Recovery link consumed'
                    : 'Unrecognized recovery link'}
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                {tokenState?.status === PasswordResetTokenStatus.EXPIRED
                  ? 'This password recovery link has exceeded its validity window. Please initiate a new request.'
                  : tokenState?.status === PasswordResetTokenStatus.USED
                    ? 'This password recovery link has already been used to update credentials.'
                    : 'This recovery link is unrecognized or malformed. Please request a fresh link.'}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-col space-y-3 border-t border-border/70 pt-4">
              <Link href="/forgot-password" className={linkClassName}>
                Request fresh recovery link
              </Link>
            </CardFooter>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          key="reset-password-form"
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
          transition={standardTransition}
        >
          {renderResetForm()}
        </motion.div>
      )}
    </AnimatePresence>
  );

  function renderResetForm() {
    return (
      <Card className="motion-enter-soft premium-panel w-full max-w-md rounded-lg border-border/70">
        <CardHeader className="space-y-1 pb-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
            CREDENTIAL RECOVERY
          </p>
          <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
            Establish new password
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Configure an updated, secure password to restore workspace access.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-foreground/90">
                New password
              </Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Create a strong password"
                {...register('newPassword')}
                className={enterpriseInputClass}
                disabled={isLoading}
              />
              <AnimatePresence initial={false}>
                {errors.newPassword ? (
                  <motion.p
                    key="reset-password-error"
                    role="alert"
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                    transition={standardTransition}
                    className="text-sm font-medium text-red-600 dark:text-red-400"
                  >
                    {errors.newPassword.message}
                  </motion.p>
                ) : null}
              </AnimatePresence>
              <AnimatePresence initial={false}>
                {newPassword ? (
                  <motion.div
                    key="reset-password-strength"
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                    transition={standardTransition}
                  >
                    <PasswordStrengthIndicator password={newPassword} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground/90">
                Confirm password confirmation
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm your password"
                {...register('confirmPassword')}
                className={enterpriseInputClass}
                disabled={isLoading}
              />
              <AnimatePresence initial={false}>
                {errors.confirmPassword ? (
                  <motion.p
                    key="reset-confirm-password-error"
                    role="alert"
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                    transition={standardTransition}
                    className="text-sm font-medium text-red-600 dark:text-red-400"
                  >
                    {errors.confirmPassword.message}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>

            <motion.div
              variants={showSuccessAnimation ? celebrationVariants : {}}
              initial={showSuccessAnimation ? 'initial' : false}
              animate={showSuccessAnimation ? 'animate' : false}
            >
              <Button
                type="submit"
                className={`h-10 w-full ${enterprisePrimaryButtonClass}`}
                disabled={isLoading}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isLoading ? (
                    <motion.span
                      key="reset-loading"
                      variants={iconSwapVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={iconSwapTransition}
                      className="inline-flex items-center"
                    >
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </motion.span>
                  ) : (
                    <motion.span
                      key="reset-idle"
                      variants={iconSwapVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={iconSwapTransition}
                    >
                      Update password
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>

            <AnimatePresence initial={false}>
              {errors.root?.message ? (
                <motion.p
                  key="reset-root-error"
                  role="alert"
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                  transition={standardTransition}
                  className="text-center text-sm font-medium text-red-600 dark:text-red-400"
                >
                  {errors.root.message}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-3 border-t border-border/70 pt-4">
          <Link href="/login" className={linkClassName}>
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }
}
