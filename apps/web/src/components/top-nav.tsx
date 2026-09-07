'use client';

import Link from 'next/link';

import { ThemeToggle } from './theme-toggle';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { enterprisePrimaryButtonClass } from '~/components/ui/enterprise-styles';
import { useAuth } from '~/hooks/use-auth';

export function TopNav() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'MiviaLabs';
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const apiUrl = rawApiUrl.replace(/\/+$/, '');
  const apiDocsUrl = apiUrl
    ? `${apiUrl}${apiUrl.endsWith('/api') ? '/docs' : '/api/docs'}`
    : '/api/docs';
  const { isAuthenticated } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b border-border/70 bg-background/86 backdrop-blur-xl">
      <div className="container">
        <div className="flex min-h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-secondary/55"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
              <span className="text-xs font-semibold tracking-[0.12em]">ML</span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-[-0.015em] text-foreground">
                {appName}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">Workspace</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Public
            </Badge>
            <a
              href={apiDocsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--control-hover))] hover:text-foreground md:inline-flex"
            >
              API Docs
            </a>
            <ThemeToggle compact />
            {isAuthenticated ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" className={enterprisePrimaryButtonClass}>
                  <Link href="/register">Start workspace</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
