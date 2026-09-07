import React from 'react';

import type { AdminSessionUser } from '~/lib/admin-auth';

import { AppSidebar } from '~/components/app-shell/app-sidebar';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';

export function AppShell({
  user,
  children
}: {
  user: AdminSessionUser;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar user={user} />
      <SidebarInset className="min-h-svh bg-background">
        <div className="min-h-svh w-full px-4 py-4 sm:px-6 sm:py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
