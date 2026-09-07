import React, { type ReactNode } from 'react';

import { ThemeToggle } from '~/components/theme-toggle';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

export const enum AuthShellContentWidth {
  Lg = 'lg',
  Xl = 'xl'
}

export function AuthShell({
  children,
  eyebrow = 'Secure Access',
  title,
  description,
  aside,
  contentWidth = AuthShellContentWidth.Lg,
  className
}: {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  aside?: ReactNode;
  contentWidth?: AuthShellContentWidth;
  className?: string;
}) {
  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-3 py-3 sm:px-4 sm:py-4">
        <section className="grid min-h-[calc(100svh-1.5rem)] flex-1 overflow-hidden border border-border/70 bg-background md:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.8fr)]">
          <div className="relative hidden border-r border-border/70 bg-[linear-gradient(180deg,hsl(var(--panel-elevated)),hsl(var(--panel)))] px-8 py-8 md:flex md:flex-col md:justify-between">
            <div className="space-y-3">
              <Badge
                variant="secondary"
                className="w-fit rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-2.5 py-1 uppercase tracking-[0.16em] text-muted-foreground"
              >
                {eyebrow}
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-md text-balance text-[2.3rem] font-semibold leading-[0.98] tracking-[-0.03em] text-foreground">
                  {title}
                </h1>
                <p className="max-w-md text-[15px] leading-7 text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Workspace
                </p>
                <p className="mt-1 text-sm text-foreground">Tenant-aware authentication surface</p>
              </div>
              <ThemeToggle compact />
            </div>
          </div>

          <div className="flex items-center justify-center bg-[hsl(var(--panel))] px-4 py-6 sm:px-6 md:px-8">
            <section
              className={cn(
                'motion-enter-soft w-full',
                contentWidth === AuthShellContentWidth.Xl ? 'max-w-152' : 'max-w-120',
                className
              )}
              style={{ animationDelay: '60ms' }}
            >
              <div className="mb-5 space-y-2 md:hidden">
                <Badge
                  variant="secondary"
                  className="w-fit rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-2.5 py-1 uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {eyebrow}
                </Badge>
                <div className="space-y-2">
                  <h1 className="text-balance text-[1.75rem] font-semibold tracking-tight text-foreground">
                    {title}
                  </h1>
                  <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              </div>

              {aside ? (
                <div
                  className="motion-enter-soft mb-3 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3 text-[13px] leading-6 text-muted-foreground"
                  style={{ animationDelay: '80ms' }}
                >
                  {aside}
                </div>
              ) : null}

              <div className="space-y-3">
                {children}
                <div className="flex justify-end md:hidden">
                  <ThemeToggle compact />
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
