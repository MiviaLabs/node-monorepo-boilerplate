'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Loader2, LogOut, ShieldCheck, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

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
import { authApi } from '~/lib/api/auth-api';
import { iconSwapTransition, iconSwapVariants, standardTransition } from '~/lib/motion';

const enum InvitationActionKind {
  ACCEPT = 'accept',
  DECLINE = 'decline'
}

interface ExistingAccountInvitationPanelProps {
  invitationToken: string;
  tenantId: string;
  tenantName: string;
  invitedEmailMasked: string;
}

export function ExistingAccountInvitationPanel({
  invitationToken,
  tenantId,
  tenantName,
  invitedEmailMasked
}: ExistingAccountInvitationPanelProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, login, logout, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    setError(null);

    try {
      await login(email, password, { redirectTo: null });
      setPassword('');
      toast.success('Signed in', {
        description: 'Review the invitation and choose accept or decline.'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    }
  };

  const handleInvitationAction = async (action: InvitationActionKind) => {
    if (!isAuthenticated) {
      setError('Sign in before responding to this invitation.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (action === InvitationActionKind.ACCEPT) {
        await authApi.acceptInvitation({ token: invitationToken, tenantId });
        toast.success('Invitation accepted', {
          description: `You can now access ${tenantName} from your workspace switcher.`
        });
      } else {
        await authApi.declineInvitation({ token: invitationToken, tenantId });
        toast.success('Invitation declined', {
          description: `You declined the invitation to ${tenantName}.`
        });
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invitation action failed';
      setError(message);
      toast.error(action === InvitationActionKind.ACCEPT ? 'Accept failed' : 'Decline failed', {
        description: message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/92 text-card-foreground shadow-[0_14px_34px_-24px_rgba(15,23,42,0.3)] dark:shadow-[0_14px_28px_-22px_rgba(0,0,0,0.6)]">
      <CardHeader className="space-y-1 pb-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
          EXISTING ACCOUNT
        </p>
        <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
          Workspace Invitation
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          This invite is designated for an existing user account. Authenticate below to confirm or
          decline membership.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-foreground/80" />
            <div className="space-y-1 text-muted-foreground">
              <p className="font-medium text-foreground">Invitation target</p>
              <p>{invitedEmailMasked}</p>
              <p className="text-xs">Sign in with the matching account before continuing.</p>
            </div>
          </div>
        </div>

        {isAuthenticated ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
              <p className="font-medium text-foreground">Signed in as {user?.email ?? 'unknown'}</p>
              <p className="mt-1 text-muted-foreground">
                Choose how you want to respond to the invitation for {tenantName}.
              </p>
            </div>

            <div className="grid gap-3">
              <Button
                type="button"
                className={`h-10 w-full ${enterprisePrimaryButtonClass}`}
                disabled={isSubmitting || isLoading}
                onClick={() => void handleInvitationAction(InvitationActionKind.ACCEPT)}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isSubmitting ? (
                    <motion.span
                      key="accept-loading"
                      variants={iconSwapVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={iconSwapTransition}
                      className="inline-flex items-center"
                    >
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Accepting...
                    </motion.span>
                  ) : (
                    <motion.span
                      key="accept-idle"
                      variants={iconSwapVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={iconSwapTransition}
                      className="inline-flex items-center"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Accept invitation
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                disabled={isSubmitting || isLoading}
                onClick={() => void handleInvitationAction(InvitationActionKind.DECLINE)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Decline invitation
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full"
                disabled={isSubmitting || isLoading}
                onClick={() => void logout()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out and use another account
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSignIn();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="existing-account-email" className="text-foreground/90">
                Email
              </Label>
              <Input
                id="existing-account-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={enterpriseInputClass}
                disabled={isLoading || isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="existing-account-password" className="text-foreground/90">
                Password
              </Label>
              <Input
                id="existing-account-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={enterpriseInputClass}
                disabled={isLoading || isSubmitting}
              />
            </div>

            <Button
              type="submit"
              className={`h-10 w-full ${enterprisePrimaryButtonClass}`}
              disabled={
                isLoading || isSubmitting || email.trim().length === 0 || password.length === 0
              }
            >
              <AnimatePresence mode="wait" initial={false}>
                {isLoading ? (
                  <motion.span
                    key="signin-loading"
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
                    key="signin-idle"
                    variants={iconSwapVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={iconSwapTransition}
                  >
                    Sign in to continue
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </form>
        )}

        <AnimatePresence initial={false}>
          {error ? (
            <motion.p
              key="existing-account-invitation-error"
              role="alert"
              aria-live="polite"
              initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
              transition={standardTransition}
              className="text-sm font-medium text-red-600 dark:text-red-400"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </CardContent>
      <CardFooter className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
        Accepting or declining this invitation modifies membership permissions without creating
        duplicate accounts.
      </CardFooter>
    </Card>
  );
}
