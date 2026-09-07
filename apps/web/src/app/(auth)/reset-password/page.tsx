import Link from 'next/link';

import { AuthPageShell, ResetPasswordForm } from '~/components/auth';
import { Button } from '~/components/ui/button';

interface ResetPasswordPageProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = params.token?.trim();

  if (!token) {
    return (
      <AuthPageShell>
        <div className="w-full rounded-2xl border border-border/80 bg-card/92 p-6 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.3)] dark:shadow-[0_14px_28px_-22px_rgba(0,0,0,0.6)] animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
            PASSWORD RESET
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Reset link is incomplete
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">This reset link is missing a token.</p>
          <Button
            asChild
            variant="outline"
            className="mt-4 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px"
          >
            <Link href="/forgot-password">Request a new reset link</Link>
          </Button>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <ResetPasswordForm token={token} />
    </AuthPageShell>
  );
}
