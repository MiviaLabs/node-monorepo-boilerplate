'use client';

import { Moon, SunMedium } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { cn } from '~/lib/utils';

const allThemes = [
  { label: 'Light', value: 'light', icon: SunMedium },
  { label: 'Dark', value: 'dark', icon: Moon }
] as const;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const fallbackTheme = 'light';
  const currentTheme = theme === 'system' ? resolvedTheme : theme;
  const activeTheme = mounted ? (currentTheme ?? fallbackTheme) : fallbackTheme;
  const activeIndex = Math.max(
    0,
    allThemes.findIndex((item) => item.value === activeTheme)
  );

  return (
    <div
      className={cn(
        'relative inline-flex rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] p-0.5',
        compact && 'rounded-lg bg-[hsl(var(--control)/0.92)]'
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 rounded-[5px] bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: 'calc((100% - 0.25rem) / 2)',
          transform: `translateX(${activeIndex * 100}%)`
        }}
      />
      {allThemes.map((item) => {
        const Icon = item.icon;
        const isActive = activeTheme === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => setTheme(item.value)}
            className={cn(
              'relative z-10 inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[11px] font-medium transition-[color,transform] duration-150 active:scale-[0.98]',
              compact && 'px-2 py-1 text-[10px]',
              isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={isActive}
            aria-label={`Switch to ${item.label.toLowerCase()} theme`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
