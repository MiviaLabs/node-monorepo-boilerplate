'use client';

import { Loader2, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

import { getLoginErrorToastPayload, getLoginSuccessToastPayload } from './auth-toast';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

const installSchema = z
  .object({
    organizationName: z.string().min(2, 'Organization name must be at least 2 characters.'),
    organizationSlug: z
      .string()
      .min(4, 'Organization slug must be at least 4 characters.')
      .regex(/^[a-z0-9-]+$/, 'Organization slug can use lowercase letters, numbers, and hyphens.'),
    displayName: z.string().min(2, 'Display name must be at least 2 characters.'),
    email: z.email('Enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).+$/,
        'Password must contain uppercase, lowercase, number, and special character.'
      ),
    confirmPassword: z.string()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword']
  });

type InstallState = z.infer<typeof installSchema>;

const INITIAL_STATE: InstallState = {
  organizationName: '',
  organizationSlug: '',
  displayName: '',
  email: '',
  password: '',
  confirmPassword: ''
};

export function InstallForm() {
  const [form, setForm] = useState<InstallState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Partial<Record<keyof InstallState | 'root', string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const organizationSlug = slugTouched ? form.organizationSlug : slugify(form.organizationName);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const parsed = installSchema.safeParse({
      ...form,
      organizationSlug
    });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        organizationName: fieldErrors.organizationName?.[0],
        organizationSlug: fieldErrors.organizationSlug?.[0],
        displayName: fieldErrors.displayName?.[0],
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
        confirmPassword: fieldErrors.confirmPassword?.[0]
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/bootstrap/install', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(parsed.data)
      });

      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? 'Bootstrap installation failed.');
      }

      const payload = getLoginSuccessToastPayload(
        'Initial system owner created. Continue to sign in with your new credentials.'
      );
      toast.success(payload.title, { description: payload.description });
      window.setTimeout(() => {
        window.location.assign('/');
      }, 300);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Unable to complete the bootstrap installation.';
      const payload = getLoginErrorToastPayload(message);
      setErrors({ root: message });
      toast.error(payload.title, { description: payload.description });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="motion-enter-soft premium-panel w-full rounded-lg border-border/70">
      <CardHeader className="space-y-3 pb-4">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-elevated))] text-accent">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-[1.25rem] tracking-[-0.04em]">Initialize workspace</CardTitle>
          <CardDescription>
            Create the first organization and the first system owner for this deployment.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" noValidate onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label
              htmlFor="organizationName"
              className="text-[13px] font-medium text-muted-foreground"
            >
              Organization name
            </Label>
            <Input
              id="organizationName"
              value={form.organizationName}
              onChange={(event) =>
                setForm((current) => ({ ...current, organizationName: event.target.value }))
              }
              disabled={isSubmitting}
              className="h-10"
            />
            {errors.organizationName ? (
              <p className="text-sm font-medium text-destructive">{errors.organizationName}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="organizationSlug"
              className="text-[13px] font-medium text-muted-foreground"
            >
              Organization slug
            </Label>
            <Input
              id="organizationSlug"
              value={organizationSlug}
              onChange={(event) => {
                setSlugTouched(true);
                setForm((current) => ({
                  ...current,
                  organizationSlug: slugify(event.target.value)
                }));
              }}
              disabled={isSubmitting}
              className="h-10"
            />
            {errors.organizationSlug ? (
              <p className="text-sm font-medium text-destructive">{errors.organizationSlug}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName" className="text-[13px] font-medium text-muted-foreground">
              Owner display name
            </Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({ ...current, displayName: event.target.value }))
              }
              disabled={isSubmitting}
              className="h-10"
            />
            {errors.displayName ? (
              <p className="text-sm font-medium text-destructive">{errors.displayName}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[13px] font-medium text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              disabled={isSubmitting}
              className="h-10"
            />
            {errors.email ? (
              <p className="text-sm font-medium text-destructive">{errors.email}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13px] font-medium text-muted-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              disabled={isSubmitting}
              className="h-10"
            />
            {errors.password ? (
              <p className="text-sm font-medium text-destructive">{errors.password}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="confirmPassword"
              className="text-[13px] font-medium text-muted-foreground"
            >
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) =>
                setForm((current) => ({ ...current, confirmPassword: event.target.value }))
              }
              disabled={isSubmitting}
              className="h-10"
            />
            {errors.confirmPassword ? (
              <p className="text-sm font-medium text-destructive">{errors.confirmPassword}</p>
            ) : null}
          </div>

          {errors.root ? (
            <p className="motion-enter-soft text-sm text-muted-foreground">{errors.root}</p>
          ) : null}

          <Button type="submit" className="h-9 w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating initial owner
              </>
            ) : (
              'Complete installation'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
