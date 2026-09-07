import { cva } from 'class-variance-authority';

export const enterpriseCardVariants = cva(
  'border-border/50 bg-card/95 text-card-foreground shadow-none',
  {
    variants: {
      tone: {
        default: '',
        danger:
          'border-red-200/80 bg-red-50/60 text-red-900 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100'
      }
    },
    defaultVariants: {
      tone: 'default'
    }
  }
);

export const enterprisePrimaryButtonClass =
  'border border-[hsl(var(--primary-border)/0.58)] bg-[linear-gradient(124deg,hsl(var(--primary-gradient-from))_0%,hsl(var(--primary-gradient-via))_46%,hsl(var(--primary-gradient-to))_100%)] text-slate-100 transition-all hover:brightness-[1.04]';

export const enterpriseOutlineButtonClass =
  'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground';

export const enterpriseInputClass =
  'border-input bg-background text-foreground placeholder:text-muted-foreground';
