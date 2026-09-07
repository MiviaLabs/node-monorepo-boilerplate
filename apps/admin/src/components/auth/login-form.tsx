'use client';

import { Loader2, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

import { getLoginErrorToastPayload, getLoginSuccessToastPayload } from './auth-toast';

const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

type LoginState = {
  email: string;
  password: string;
};

export function LoginForm() {
  const [form, setForm] = useState<LoginState>({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginState | 'root', string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0]
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(parsed.data)
      });
      const result = (await response.json()) as { message?: string; redirectTo?: string };
      const redirectTo = result.redirectTo;

      if (!response.ok || !redirectTo) {
        throw new Error(result.message ?? 'Unable to establish a session.');
      }

      const payload = getLoginSuccessToastPayload(
        result.message ?? `Session established. Redirect target: ${result.redirectTo}`
      );
      toast.success(payload.title, {
        description: payload.description
      });
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.location.assign(redirectTo);
        }, 300);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Unable to establish a session.';
      const payload = getLoginErrorToastPayload(message);
      setErrors({ root: message });
      toast.error(payload.title, {
        description: payload.description
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="motion-enter-soft premium-panel w-full rounded-lg border-border/70">
      <CardHeader className="space-y-3 pb-4">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-elevated))] text-accent">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-[1.25rem] tracking-[-0.04em]">Authenticate</CardTitle>
          <CardDescription>Provide your administrator credentials to proceed.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" noValidate onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[13px] font-medium text-muted-foreground">
              Work Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="operator@company.internal"
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
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <Label htmlFor="password" className="text-[13px] font-medium text-muted-foreground">
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="inline-flex items-center text-[12px] text-muted-foreground underline-offset-4 transition-[color,text-decoration-color] duration-200 hover:text-foreground hover:underline"
              >
                Forgot credentials?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your security token"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              disabled={isSubmitting}
              className="h-10"
            />
            {errors.password ? (
              <p className="motion-enter-soft text-sm font-medium text-destructive">
                {errors.password}
              </p>
            ) : null}
          </div>

          {errors.root ? (
            <p className="motion-enter-soft text-sm text-muted-foreground">{errors.root}</p>
          ) : null}

          <Button type="submit" className="h-9 w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying credentials…
              </>
            ) : (
              'Log in'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
