import React from 'react';

import { Badge } from '~/components/ui/badge';
import { SidebarTrigger } from '~/components/ui/sidebar';

export function PageHeader({
  title,
  description,
  badge = 'Overview',
  actions
}: {
  title: string;
  description?: string;
  badge?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-border/70 pb-5 sm:mb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="pt-0.5 md:hidden">
            <SidebarTrigger className="h-10 w-10 rounded-md border border-border/70 bg-[hsl(var(--control))]" />
          </div>
          <div className="min-w-0 space-y-2">
            <Badge
              variant="secondary"
              className="w-fit rounded-md px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]"
            >
              {badge}
            </Badge>
            <div className="space-y-1">
              <h1 className="text-[1.5rem] font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
                {title}
              </h1>
              {description ? (
                <p className="max-w-3xl text-[15px] leading-7 text-muted-foreground/95">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">{actions}</div>
      </div>

      {actions ? <div className="mt-4 flex flex-wrap gap-2 md:hidden">{actions}</div> : null}
    </header>
  );
}
