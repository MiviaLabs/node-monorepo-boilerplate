'use client';

import { Check, ChevronUp, LogOut, Moon, Settings2, SunMedium, UserCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import React from 'react';

import type { AdminSessionUser } from '~/lib/admin-auth';

import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '~/components/ui/sidebar';
import { cn } from '~/lib/utils';

const enum ThemeOption {
  Light = 'light',
  Dark = 'dark'
}

export function UserNav({ user }: { user: AdminSessionUser }) {
  const { isMobile, state } = useSidebar();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLLIElement | null>(null);
  const isCollapsed = !isMobile && state === 'collapsed';
  const activeTheme = (theme ?? resolvedTheme ?? ThemeOption.Light) as ThemeOption;

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selectTheme = (nextTheme: ThemeOption) => {
    setOpen(false);
    setTheme(nextTheme);
  };

  const itemClassName =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-[hsl(var(--control))] focus-visible:bg-[hsl(var(--control))] focus-visible:outline-hidden [&>svg]:size-4 [&>svg]:shrink-0';

  return (
    <SidebarMenu>
      <SidebarMenuItem ref={containerRef}>
        <SidebarMenuButton
          type="button"
          size="lg"
          aria-haspopup="menu"
          aria-expanded={open}
          className="h-auto rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 px-2.5 py-2 hover:bg-sidebar-accent/70"
          onClick={() => setOpen((current) => !current)}
        >
          <Avatar className="h-8 w-8 rounded-md border border-sidebar-border/80">
            <AvatarFallback className="rounded-md bg-sidebar-primary/12 text-[11px] font-semibold text-sidebar-primary">
              {user.avatarFallback}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 text-left text-[13px] leading-tight">
            <span className="truncate font-medium text-sidebar-foreground">{user.name}</span>
            <span className="truncate text-[11px] text-sidebar-foreground/55">{user.role}</span>
          </div>
          <ChevronUp
            className={cn(
              'ml-auto h-4 w-4 shrink-0 text-sidebar-foreground/70 transition-transform',
              open ? 'rotate-180' : 'rotate-0'
            )}
          />
        </SidebarMenuButton>
        {open ? (
          <div
            role="menu"
            className={cn(
              'absolute z-50 w-64 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--panel))] p-1',
              isMobile
                ? 'bottom-[calc(100%+0.625rem)] left-0'
                : isCollapsed
                  ? 'bottom-0 left-[calc(100%+0.625rem)]'
                  : 'bottom-[calc(100%+0.625rem)] left-0'
            )}
          >
            <div className="space-y-1 px-2 py-1.5">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
            <div className="-mx-1 my-1 h-px bg-[hsl(var(--border-subtle))]" />
            <div className="space-y-1">
              <Link
                href="/profile"
                role="menuitem"
                className={cn(itemClassName, 'text-foreground')}
                onClick={() => setOpen(false)}
              >
                <UserCircle2 className="h-4 w-4" />
                Profile
              </Link>
              <Link
                href="/settings"
                role="menuitem"
                className={cn(itemClassName, 'text-foreground')}
                onClick={() => setOpen(false)}
              >
                <Settings2 className="h-4 w-4" />
                Settings
              </Link>
            </div>
            <div className="-mx-1 my-1 h-px bg-[hsl(var(--border-subtle))]" />
            <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-tertiary">
              Theme
            </div>
            <div className="space-y-1">
              <button
                type="button"
                className={itemClassName}
                onClick={() => selectTheme(ThemeOption.Light)}
              >
                <SunMedium className="h-4 w-4" />
                Light
                {activeTheme === ThemeOption.Light ? <Check className="ml-auto h-4 w-4" /> : null}
              </button>
              <button
                type="button"
                className={itemClassName}
                onClick={() => selectTheme(ThemeOption.Dark)}
              >
                <Moon className="h-4 w-4" />
                Dark
                {activeTheme === ThemeOption.Dark ? <Check className="ml-auto h-4 w-4" /> : null}
              </button>
            </div>
            <div className="-mx-1 my-1 h-px bg-[hsl(var(--border-subtle))]" />
            <Link
              href="/logout"
              className={cn(itemClassName, 'text-foreground')}
              onClick={() => setOpen(false)}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Link>
          </div>
        ) : null}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
