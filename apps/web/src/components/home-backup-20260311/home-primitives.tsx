import { homePalette } from './home-palette';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

export function HomeSection({
  title,
  description,
  children,
  className,
  compact = false
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section className={cn(compact ? 'space-y-3' : 'space-y-4', className)}>
      <div className={cn(compact ? 'space-y-0.5' : 'space-y-1')}>
        <h2
          className={cn(
            `font-semibold tracking-tight ${homePalette.title}`,
            compact ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className={cn(homePalette.muted, compact ? 'text-xs md:text-sm' : 'text-sm')}>
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function HomeSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        `${homePalette.surface} transition-[border-color,background-color,box-shadow] duration-200`,
        className
      )}
    >
      {children}
    </div>
  );
}

export function CapabilityCard({
  title,
  description,
  icon: Icon,
  compact = false
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  compact?: boolean;
}) {
  return (
    <HomeSurface className={cn('h-full', compact ? 'p-4' : 'p-5')}>
      <div className={cn(compact ? 'space-y-2' : 'space-y-3')}>
        <div
          className={cn(
            'inline-flex rounded-lg border border-border/60 bg-accent/45 text-accent-foreground',
            compact ? 'p-1.5' : 'p-2'
          )}
        >
          <Icon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </div>
        <h3 className={cn(`font-semibold ${homePalette.title}`, compact ? 'text-sm' : 'text-base')}>
          {title}
        </h3>
        <p className={cn(homePalette.muted, compact ? 'text-xs leading-5' : 'text-sm leading-6')}>
          {description}
        </p>
      </div>
    </HomeSurface>
  );
}

export function CommandSnippet({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/70 p-3 text-[11px] text-foreground md:text-xs">
      <code>{children}</code>
    </pre>
  );
}
