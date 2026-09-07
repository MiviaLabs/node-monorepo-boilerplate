'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { forgotPasswordSchema, type ForgotPasswordFormData } from './auth-validation';

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
import { iconSwapTransition, iconSwapVariants, standardTransition } from '~/lib/motion';

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const linkClassName =
    'font-medium text-foreground/90 underline-offset-4 transition-colors hover:text-foreground hover:underline';

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors }
  } = useForm<ForgotPasswordFormData>({
    defaultValues: {
      email: ''
    }
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    clearErrors();
    const validation = forgotPasswordSchema.safeParse(data);
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if (field === 'email') {
          setError(field, { type: 'manual', message: issue.message });
        }
      }
      return;
    }

    setIsLoading(true);
    try {
      await authApi.requestPasswordReset(validation.data);
      setSubmitted(true);
      toast.success('Reset request received', {
        description: 'If an account exists, reset instructions were sent to your email.'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to request password reset';
      setError('root', { type: 'server', message });
      toast.error('Request failed', { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {submitted ? (
        <motion.div
          key="submitted"
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
                Inbox dispatched
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                If matching credentials were found, a secure reset link has been dispatched to your
                address.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-col space-y-3 border-t border-border/70 pt-4">
              <Link href="/login" className={linkClassName}>
                Return to log in
              </Link>
            </CardFooter>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          key="form"
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
                Recover your access
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Submit your registered email address to receive password restoration steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground/90">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    {...register('email')}
                    className={enterpriseInputClass}
                    disabled={isLoading}
                  />
                  <AnimatePresence initial={false}>
                    {errors.email ? (
                      <motion.p
                        key="forgot-email-error"
                        role="alert"
                        initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                        transition={standardTransition}
                        className="text-sm font-medium text-red-600 dark:text-red-400"
                      >
                        {errors.email.message}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </div>

                <Button
                  type="submit"
                  className={`h-10 w-full ${enterprisePrimaryButtonClass}`}
                  disabled={isLoading}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {isLoading ? (
                      <motion.span
                        key="forgot-loading"
                        variants={iconSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={iconSwapTransition}
                        className="inline-flex items-center"
                      >
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </motion.span>
                    ) : (
                      <motion.span
                        key="forgot-idle"
                        variants={iconSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={iconSwapTransition}
                      >
                        Request reset link
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>

                <AnimatePresence initial={false}>
                  {errors.root?.message ? (
                    <motion.p
                      key="forgot-root-error"
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
              <div className="text-center text-sm text-muted-foreground">
                Remember your credentials?{' '}
                <Link href="/login" className={linkClassName}>
                  Sign in instead
                </Link>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
