'use client';

import { Toaster as Sonner } from 'sonner';

import { enterprisePrimaryButtonClass } from '~/components/ui/enterprise-styles';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast border border-border bg-card text-card-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: enterprisePrimaryButtonClass,
          cancelButton:
            'border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80'
        }
      }}
      {...props}
    />
  );
};

export { Toaster };
