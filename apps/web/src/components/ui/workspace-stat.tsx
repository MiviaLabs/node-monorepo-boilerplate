import Link from 'next/link';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

export const enum WorkspaceStatSize {
  DEFAULT = 'default',
  COMPACT = 'compact'
}

interface WorkspaceStatProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconClassName: string;
  size?: WorkspaceStatSize;
  href?: string;
  actionLabel?: string;
  trailing?: ReactNode;
  className?: string;
}

export function WorkspaceStat({
  label,
  value,
  icon: Icon,
  iconClassName,
  size = WorkspaceStatSize.DEFAULT,
  href,
  actionLabel,
  trailing,
  className
}: WorkspaceStatProps) {
  const isCompact = size === WorkspaceStatSize.COMPACT;
  const content = (
    <>
      <div className={cn('flex items-center', isCompact ? 'gap-2.5' : 'gap-3')}>
        <div
          className={cn(
            'flex items-center justify-center rounded-lg ring-1 transition-[transform,background-color] duration-150 group-hover:scale-105',
            isCompact ? 'h-7 w-7' : 'h-8 w-8',
            iconClassName
          )}
        >
          <Icon className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </div>
        <div>
          <p
            className={cn(
              'font-medium uppercase tracking-wider text-muted-foreground/70',
              isCompact ? 'text-[9px]' : 'text-[10px]'
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              'font-bold tracking-tight text-foreground',
              isCompact ? 'text-sm' : 'text-base'
            )}
          >
            {value}
          </p>
        </div>
      </div>
      {(trailing ?? actionLabel) ? (
        <div
          className={cn(
            'flex items-center gap-2 font-medium text-muted-foreground/80 transition-colors group-hover:text-foreground',
            isCompact ? 'text-[10px]' : 'text-[11px]'
          )}
        >
          {trailing}
          {actionLabel ? <span>{actionLabel}</span> : null}
        </div>
      ) : null}
    </>
  );

  const sharedClassName = cn(
    'group flex items-center rounded-xl border border-border/40 bg-card/40 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-border/80 hover:bg-card/60 hover:shadow-xs',
    isCompact ? 'gap-2.5 px-2.5 py-1' : 'gap-3 px-3 py-1.5',
    trailing || actionLabel ? 'justify-between' : '',
    href ? 'hover:-translate-y-0.5' : '',
    className
  );

  if (href) {
    return (
      <Link href={href} className={sharedClassName}>
        {content}
      </Link>
    );
  }

  return <div className={sharedClassName}>{content}</div>;
}
