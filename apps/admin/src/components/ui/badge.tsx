import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border font-medium tracking-[0.03em] transition-colors focus:outline-hidden focus:ring-1 focus:ring-ring',
  {
    variants: {
      variant: {
        default:
          'border-[hsl(var(--border-subtle))] bg-[hsl(var(--panel-elevated))] text-foreground',
        secondary:
          'border-[hsl(var(--border-subtle))] bg-[hsl(var(--panel-subtle))] text-[hsl(var(--text-secondary))]',
        destructive:
          'border-[hsl(var(--destructive)/0.18)] bg-[hsl(var(--destructive)/0.08)] text-destructive',
        outline: 'border-[hsl(var(--border-subtle))] bg-transparent text-foreground'
      },
      size: {
        default: 'px-2 py-0.5 text-[11px]',
        sm: 'px-1.5 py-0 text-[10px] leading-4'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
