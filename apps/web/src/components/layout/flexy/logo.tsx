import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';

import type { UserOrganization } from '~/types/auth.types';

import { DashboardRoute } from '~/components/dashboard/shell-routes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';

interface FlexyLogoProps {
  collapsed: boolean;
  organizationName?: string;
  organizations: UserOrganization[];
  activeOrganizationId?: string | null;
  onOrganizationSelect?: (organizationId: string) => void;
  isSwitchingOrganization?: boolean;
}

export function FlexyLogo({
  collapsed,
  organizationName,
  organizations,
  activeOrganizationId,
  onOrganizationSelect,
  isSwitchingOrganization = false
}: FlexyLogoProps) {
  const displayName = organizationName ?? 'Workspace';
  const initial = displayName.charAt(0).toUpperCase();
  const canSwitchOrganizations = organizations.length > 1 && Boolean(onOrganizationSelect);

  const triggerContent = (
    <div className="group flex cursor-pointer select-none items-center gap-2.5 rounded-md px-1.5 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-white/5">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-white shadow-xs ring-1 ring-border/50">
        <div className="flex h-full w-full items-center justify-center bg-linear-to-tr from-primary/30 to-primary/10 text-[11px] font-bold text-primary">
          {initial}
        </div>
      </div>
      {!collapsed && (
        <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
          <span className="truncate tracking-tight">{displayName}</span>
          {canSwitchOrganizations ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          ) : null}
        </div>
      )}
    </div>
  );

  if (collapsed) {
    return <Link href={DashboardRoute.Dashboard}>{triggerContent}</Link>;
  }

  if (!canSwitchOrganizations) {
    return triggerContent;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{triggerContent}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {organizations.map((organization) => {
          const optionName = organization.displayName ?? organization.name;
          const optionInitial = optionName.charAt(0).toUpperCase();
          const isActive = organization.organizationId === activeOrganizationId;
          return (
            <DropdownMenuItem
              key={organization.organizationId}
              className="flex items-center justify-between"
              disabled={isActive || isSwitchingOrganization}
              onSelect={() => onOrganizationSelect?.(organization.organizationId)}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-primary/20 text-[9px] font-bold text-primary">
                  {optionInitial}
                </div>
                <span className="truncate text-[13px]">{optionName}</span>
              </div>
              {isActive ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
