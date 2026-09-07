'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  generateOrganizationSlug,
  getRegisterValidationData,
  registerSchema,
  type RegisterFormData
} from './auth-validation';
import { PasswordStrengthIndicator } from './password-strength';

import type {
  FieldErrors,
  UseFormHandleSubmit,
  UseFormRegister,
  UseFormSetValue
} from 'react-hook-form';

import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import {
  enterpriseInputClass,
  enterprisePrimaryButtonClass
} from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { useAuth } from '~/hooks/use-auth';
import { iconSwapTransition, iconSwapVariants, standardTransition } from '~/lib/motion';

interface RegisterFormProps {
  invitationToken?: string;
  tenantId?: string;
  submitLabel?: string;
}

const validationFields = [
  'displayName',
  'organizationName',
  'organizationSlug',
  'email',
  'password',
  'confirmPassword',
  'terms'
] as const;

function isValidationField(field: unknown): field is (typeof validationFields)[number] {
  return typeof field === 'string' && (validationFields as readonly string[]).includes(field);
}

function normalizeOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getInvitationCopy(isInvitationFlow: boolean): {
  title: string;
  description: string;
  cta: string;
} {
  if (isInvitationFlow) {
    return {
      title: 'Accept Team Invite',
      description: 'Confirm your profile details to access this workspace',
      cta: 'Join Workspace'
    };
  }

  return {
    title: 'Register Workspace',
    description: 'Set up your organization and team administrator account',
    cta: 'Initialize Workspace'
  };
}

function AnimatedFieldError({ id, message }: { id: string; message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.p
          key={id}
          id={id}
          role="alert"
          aria-live="polite"
          initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
          transition={standardTransition}
          className="text-sm font-medium text-red-600 dark:text-red-400"
        >
          {message}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

function OrganizationNameField({
  register,
  organizationSlug,
  isLoading,
  inputClassName,
  errorMessage,
  slugErrorMessage
}: {
  register: UseFormRegister<RegisterFormData>;
  organizationSlug: string;
  isLoading: boolean;
  inputClassName: string;
  errorMessage?: string;
  slugErrorMessage?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="organizationName" className="text-foreground/90">
        Organization / Team name
      </Label>
      <Input
        id="organizationName"
        type="text"
        placeholder="acme-inc"
        autoComplete="organization"
        {...register('organizationName')}
        className={inputClassName}
        disabled={isLoading}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby="register-organization-helper register-organization-error"
      />
      <AnimatedFieldError id="register-organization-error" message={errorMessage} />
      <p id="register-organization-helper" className="text-xs text-muted-foreground">
        Workspace label displayed across project headers.
      </p>
      <Label htmlFor="organizationSlug" className="text-foreground/90">
        Organization identifier
      </Label>
      <Input
        id="organizationSlug"
        type="text"
        readOnly
        value={organizationSlug}
        className={inputClassName}
        disabled={isLoading}
        aria-invalid={Boolean(slugErrorMessage)}
        aria-describedby="register-organization-slug-helper register-organization-slug-error"
      />
      <AnimatedFieldError id="register-organization-slug-error" message={slugErrorMessage} />
      <p id="register-organization-slug-helper" className="text-xs text-muted-foreground">
        Auto-derived URL identifier. Standard letters, numbers, and hyphens.
      </p>
    </div>
  );
}

function RegisterFormFields({
  isInvitationFlow,
  isLoading,
  inputClassName,
  linkClassName,
  register,
  handleSubmit,
  onSubmit,
  setValue,
  errors,
  terms,
  password,
  organizationSlug,
  submitLabel,
  cta
}: {
  isInvitationFlow: boolean;
  isLoading: boolean;
  inputClassName: string;
  linkClassName: string;
  register: UseFormRegister<RegisterFormData>;
  handleSubmit: UseFormHandleSubmit<RegisterFormData>;
  onSubmit: (data: RegisterFormData) => Promise<void>;
  setValue: UseFormSetValue<RegisterFormData>;
  errors: FieldErrors<RegisterFormData>;
  terms: boolean;
  password: string;
  organizationSlug: string;
  submitLabel?: string;
  cta: string;
}) {
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="displayName" className="text-foreground/90">
          Display name
        </Label>
        <Input
          id="displayName"
          type="text"
          placeholder="John Doe"
          autoComplete="name"
          {...register('displayName')}
          className={inputClassName}
          disabled={isLoading}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={
            errors.displayName
              ? 'register-display-name-error register-display-name-helper'
              : undefined
          }
        />
        <AnimatedFieldError
          id="register-display-name-error"
          message={errors.displayName?.message}
        />
        <p id="register-display-name-helper" className="text-xs text-muted-foreground">
          Your full name as presented to team members
        </p>
      </div>

      {!isInvitationFlow ? (
        <OrganizationNameField
          register={register}
          organizationSlug={organizationSlug}
          isLoading={isLoading}
          inputClassName={inputClassName}
          errorMessage={errors.organizationName?.message}
          slugErrorMessage={errors.organizationSlug?.message}
        />
      ) : null}

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
          aria-describedby={errors.email ? 'register-email-error' : undefined}
        />
        <AnimatedFieldError id="register-email-error" message={errors.email?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-foreground/90">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="Create a strong password"
          autoComplete="new-password"
          {...register('password')}
          className={inputClassName}
          disabled={isLoading}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'register-password-error' : undefined}
        />
        <AnimatedFieldError id="register-password-error" message={errors.password?.message} />
        <AnimatePresence initial={false}>
          {password ? (
            <motion.div
              key="register-password-strength"
              initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
              transition={standardTransition}
            >
              <PasswordStrengthIndicator password={password} />
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
          placeholder="Confirm your password"
          autoComplete="new-password"
          {...register('confirmPassword')}
          className={inputClassName}
          disabled={isLoading}
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={errors.confirmPassword ? 'register-confirm-password-error' : undefined}
        />
        <AnimatedFieldError
          id="register-confirm-password-error"
          message={errors.confirmPassword?.message}
        />
      </div>

      <div className="flex items-start space-x-2">
        <Checkbox
          id="terms"
          checked={terms}
          onCheckedChange={(checked) => setValue('terms', checked === true)}
          disabled={isLoading}
          aria-invalid={Boolean(errors.terms)}
          aria-describedby={errors.terms ? 'register-terms-error' : undefined}
        />
        <Label
          htmlFor="terms"
          className="text-sm font-normal leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          I agree to the{' '}
          <Link href="/terms" className={linkClassName}>
            terms of service
          </Link>{' '}
          and acknowledge the{' '}
          <Link href="/privacy" className={linkClassName}>
            privacy policy
          </Link>
        </Label>
      </div>
      <AnimatedFieldError id="register-terms-error" message={errors.terms?.message} />

      <Button
        type="submit"
        className={`h-10 w-full ${enterprisePrimaryButtonClass}`}
        disabled={isLoading}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isLoading ? (
            <motion.span
              key="register-loading"
              variants={iconSwapVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={iconSwapTransition}
              className="inline-flex items-center"
            >
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isInvitationFlow ? 'Accepting invitation...' : 'Creating account...'}
            </motion.span>
          ) : (
            <motion.span
              key="register-idle"
              variants={iconSwapVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={iconSwapTransition}
            >
              {submitLabel ?? cta}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
      <AnimatedFieldError id="register-root-error" message={errors.root?.message} />
    </form>
  );
}

export function RegisterForm({ invitationToken, tenantId, submitLabel }: RegisterFormProps = {}) {
  const { register: registerUser, isLoading } = useAuth();
  const isInvitationFlow = Boolean(invitationToken && tenantId);
  const inputClassName = enterpriseInputClass;
  const linkClassName =
    'font-medium text-foreground/90 underline-offset-4 transition-colors hover:text-foreground hover:underline';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors }
  } = useForm<RegisterFormData>({
    defaultValues: {
      displayName: '',
      organizationName: '',
      organizationSlug: '',
      email: '',
      password: '',
      confirmPassword: '',
      terms: false
    }
  });

  const password = watch('password');
  const terms = watch('terms');
  const organizationName = watch('organizationName');
  const organizationSlug = isInvitationFlow ? '' : generateOrganizationSlug(organizationName ?? '');
  const copy = getInvitationCopy(isInvitationFlow);

  const onSubmit = async (data: RegisterFormData) => {
    clearErrors();
    const validation = registerSchema.safeParse(getRegisterValidationData(data, isInvitationFlow));
    if (!validation.success) {
      const seenFields = new Set<string>();
      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if (isValidationField(field) && !seenFields.has(field)) {
          seenFields.add(field);
          setError(field, { type: 'manual', message: issue.message });
        }
      }
      toast.error('Please fix the highlighted fields', {
        description: validation.error.issues[0]?.message ?? 'Validation failed.'
      });
      return;
    }

    try {
      await registerUser(
        validation.data.email,
        validation.data.password,
        normalizeOptional(validation.data.displayName),
        normalizeOptional(validation.data.organizationName ?? ''),
        normalizeOptional(validation.data.organizationSlug ?? ''),
        isInvitationFlow
          ? {
              tenantId,
              invitationToken
            }
          : undefined
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create account';
      setError('root', { type: 'server', message });
    }
  };

  return (
    <Card className="motion-enter-soft premium-panel w-full max-w-md rounded-lg border-border/70">
      <CardHeader className="space-y-3 pb-4">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-elevated))] text-accent">
          <UserPlus className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
            {isInvitationFlow ? 'INVITATION' : 'SIGN UP'}
          </p>
          <CardTitle className="text-[1.25rem] tracking-[-0.04em]">{copy.title}</CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          {copy.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <RegisterFormFields
          isInvitationFlow={isInvitationFlow}
          isLoading={isLoading}
          inputClassName={inputClassName}
          linkClassName={linkClassName}
          register={register}
          handleSubmit={handleSubmit}
          onSubmit={onSubmit}
          setValue={setValue}
          errors={errors}
          terms={terms}
          password={password}
          organizationSlug={organizationSlug}
          submitLabel={submitLabel}
          cta={copy.cta}
        />
      </CardContent>
      <CardFooter className="flex flex-col space-y-3 border-t border-border/70 pt-4">
        <div className="text-center text-sm text-muted-foreground">
          Existing team member?{' '}
          <Link href="/login" className={linkClassName}>
            Log in here
          </Link>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Workspaces are shielded by multi-factor checks and strict tenant sandboxing.
        </p>
      </CardFooter>
    </Card>
  );
}
