'use client';

import { KeyRound, Loader2 } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { adminPublicAuthApi } from '~/lib/auth/public-api';

import {
  getPasswordResetErrorToastPayload,
  getPasswordResetSuccessToastPayload
} from './auth-toast';

const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address.')
});

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.email?.[0] ?? 'Enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await adminPublicAuthApi.requestPasswordReset(parsed.data);
      const payload = getPasswordResetSuccessToastPayload(result.message);
      toast.success(payload.title, {
        description: payload.description
      });
    } catch {
      const message = 'Unable to start the reset flow right now.';
      setError(message);
      const payload = getPasswordResetErrorToastPayload(message);
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
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-[1.25rem] tracking-[-0.04em]">
            Request Password Reset
          </CardTitle>
          <CardDescription>Specify the email address registered to your account.</CardDescription>
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              className="h-10"
            />
            {error ? (
              <p className="motion-enter-soft text-sm font-medium text-destructive">{error}</p>
            ) : null}
          </div>

          <Button type="submit" className="h-9 w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Dispatching instructions…
              </>
            ) : (
              'Dispatch reset instructions'
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 border-t border-border/60 pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Assistance required?</span>
        <Link
          href="/"
          className="inline-flex items-center text-primary underline-offset-4 transition-[color,text-decoration-color] duration-200 hover:underline"
        >
          Return to gateway
        </Link>
      </CardFooter>
    </Card>
  );
}
