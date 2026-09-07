'use client';

import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  Building2,
  ChevronDown,
  Clock3,
  Mail,
  Inbox,
  Layers3,
  PlaySquare,
  Settings2,
  ShieldUser,
  Sparkles,
  Users2,
  UserCircle2
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

import type { AdminSessionUser } from '~/lib/admin-auth';

import { UserNav } from '~/components/app-shell/user-nav';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger
} from '~/components/ui/sidebar';

const navigationSections = [
  {
    title: 'Overview',
    items: [
      { title: 'Inbox', href: '/inbox', icon: Inbox },
      { title: 'Statistics', href: '/statistics', icon: BarChart3 }
    ]
  },
  {
    title: 'Organizations',
    items: [
      { title: 'Tenants', href: '/tenants', icon: Building2 },
      { title: 'Users', href: '/users', icon: Users2 },
      { title: 'Memberships', href: '/memberships', icon: ShieldUser },
      { title: 'Invitations', href: '/memberships/invitations', icon: BellRing }
    ]
  },
  {
    title: 'System',
    items: [
      { title: 'Emails', href: '/system/emails', icon: Mail },
      { title: 'Email webhooks', href: '/system/email-webhooks', icon: BellRing },
      { title: 'Outbox monitor', href: '/system/outbox', icon: Layers3 },
      { title: 'Dead-letter queue', href: '/system/dead-letter', icon: AlertTriangle },
      { title: 'Event replay', href: '/system/event-replay', icon: PlaySquare },
      { title: 'Deletion queue', href: '/system/deletions', icon: Clock3 },
      { title: 'Settings', href: '/settings', icon: Settings2 },
      { title: 'Health', href: '/health', icon: Activity }
    ]
  },
  {
    title: 'Account',
    items: [{ title: 'Profile', href: '/profile', icon: UserCircle2 }]
  }
] as const;

export function AppSidebar({ user }: { user: AdminSessionUser }) {
  const pathname = usePathname() ?? '';
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    Overview: true,
    Organizations: true,
    System: true,
    Account: true
  });

  const toggleSection = (title: string) => {
    setOpenSections((current) => ({
      ...current,
      [title]: !current[title]
    }));
  };

  const isItemActive = (href: string) => {
    if (href === '/memberships') {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/70 bg-sidebar-background">
      <SidebarHeader className="gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Link
            href="/inbox"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent/70 group-data-[collapsible=icon]:hidden"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-primary/10 text-sidebar-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold tracking-[-0.015em] text-sidebar-foreground">
                Mivia Labs
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/55">Admin</span>
            </div>
          </Link>
          <SidebarTrigger className="hidden h-7 w-7 rounded-md border border-sidebar-border/70 bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent/75 md:flex group-data-[collapsible=icon]:mx-auto" />
        </div>

        <div className="mx-2 hidden group-data-[collapsible=icon]:hidden">
          <p className="text-[11px] uppercase tracking-[0.16em] text-sidebar-foreground/42">
            Internal
          </p>
          <p className="mt-1.5 text-[13px] leading-6 text-sidebar-foreground/62">
            Platform operations and account management.
          </p>
        </div>
      </SidebarHeader>

      <SidebarSeparator className="mx-3" />

      <SidebarContent className="gap-3 px-2 pb-3">
        <SidebarGroup className="hidden p-0 group-data-[collapsible=icon]:block">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navigationSections.flatMap((section) =>
                section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(item.href);

                  return (
                    <SidebarMenuItem key={`collapsed-${item.href}`}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={isActive}
                        className="h-9 rounded-lg px-0 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-none md:h-8"
                      >
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navigationSections.map((section) => (
          <Collapsible
            key={section.title}
            open={openSections[section.title]}
            onOpenChange={() => toggleSection(section.title)}
            className="group-data-[collapsible=icon]:hidden"
          >
            <SidebarGroup className="p-0">
              <CollapsibleTrigger asChild>
                <button className="flex min-h-8 w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/42 transition-colors hover:bg-sidebar-accent/35 hover:text-sidebar-foreground group-data-[collapsible=icon]:pointer-events-none">
                  <span>{section.title}</span>
                  <ChevronDown
                    data-chevron="true"
                    className={`h-3.5 w-3.5 transition-transform ${
                      openSections[section.title] ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = isItemActive(item.href);

                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            tooltip={item.title}
                            isActive={isActive}
                            className="h-9 rounded-lg px-3.5 text-sm data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-none md:h-8"
                          >
                            <Link href={item.href}>
                              <Icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-sidebar-border/70 bg-sidebar-background p-3">
        <UserNav user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
