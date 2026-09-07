'use client';

import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme, theme = 'system' } = useTheme();
  const activeTheme = (theme === 'system' ? resolvedTheme : theme) as ToasterProps['theme'];

  return (
    <Sonner
      theme={activeTheme}
      closeButton
      position="top-right"
      offset={16}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4 text-primary" />,
        info: <Info className="h-4 w-4 text-muted-foreground" />,
        warning: <TriangleAlert className="h-4 w-4 text-[hsl(var(--accent))]" />,
        error: <OctagonX className="h-4 w-4 text-destructive" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-xl group-[.toaster]:border-[hsl(var(--border-subtle))] group-[.toaster]:bg-[hsl(var(--panel))] group-[.toaster]:text-foreground',
          title:
            'group-[.toast]:text-[13px] group-[.toast]:font-semibold group-[.toast]:tracking-[-0.02em]',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:border group-[.toast]:border-[hsl(var(--border-strong))] group-[.toast]:bg-[hsl(var(--control))] group-[.toast]:text-muted-foreground'
        }
      }}
      {...props}
    />
  );
};

export { Toaster };
