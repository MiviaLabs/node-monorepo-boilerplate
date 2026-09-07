'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { loginSchema, type LoginFormData } from './auth-validation';

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
import { useAuth } from '~/hooks/use-auth';
import { iconSwapTransition, iconSwapVariants, standardTransition } from '~/lib/motion';

export function LoginForm() {
  const { login, isLoading } = useAuth();
  const inputClassName = enterpriseInputClass;
  const linkClassName =
    'font-medium text-foreground/90 underline-offset-4 transition-colors hover:text-foreground hover:underline';

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors }
  } = useForm<LoginFormData>({
    defaultValues: {
      email: '',
      password: ''
    }
  });

  const onSubmit = async (data: LoginFormData) => {
    clearErrors();
    const validation = loginSchema.safeParse(data);
    if (!validation.success) {
      const seenFields = new Set<string>();
      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if ((field === 'email' || field === 'password') && !seenFields.has(String(field))) {
          seenFields.add(String(field));
          setError(field, { type: 'manual', message: issue.message });
        }
      }
      toast.error('Please fix the highlighted fields', {
        description: validation.error.issues[0]?.message ?? 'Validation failed.'
      });
      return;
    }

    try {
      await login(validation.data.email, validation.data.password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in';
      setError('root', { type: 'server', message });
    }
  };

  return (
    <Card className="motion-enter-soft premium-panel w-full max-w-md rounded-lg border-border/70">
      <CardHeader className="space-y-3 pb-4">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-elevated))] text-accent">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-[1.25rem] tracking-[-0.04em]">Sign in to CoreOps</CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          Enter your credentials to access your organization workspace
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
              className={inputClassName}
              disabled={isLoading}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
            <AnimatePresence initial={false}>
              {errors.email ? (
                <motion.p
                  key="login-email-error"
                  id="login-email-error"
                  role="alert"
                  aria-live="polite"
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-foreground/90">
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Enter your security password"
              autoComplete="current-password"
              {...register('password')}
              className={inputClassName}
              disabled={isLoading}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
            />
            <AnimatePresence initial={false}>
              {errors.password ? (
                <motion.p
                  key="login-password-error"
                  id="login-password-error"
                  role="alert"
                  aria-live="polite"
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                  transition={standardTransition}
                  className="text-sm font-medium text-red-600 dark:text-red-400"
                >
                  {errors.password.message}
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
                  key="login-loading"
                  variants={iconSwapVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={iconSwapTransition}
                  className="inline-flex items-center"
                >
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </motion.span>
              ) : (
                <motion.span
                  key="login-idle"
                  variants={iconSwapVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={iconSwapTransition}
                >
                  Sign in
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
          <AnimatePresence initial={false}>
            {errors.root?.message ? (
              <motion.p
                key="login-root-error"
                id="login-root-error"
                role="alert"
                aria-live="polite"
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
          Need an account?{' '}
          <Link href="/register" className={linkClassName}>
            Create workspace
          </Link>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Protected with hardware-grade token rotation and session isolation.
        </p>
      </CardFooter>
    </Card>
  );
}
