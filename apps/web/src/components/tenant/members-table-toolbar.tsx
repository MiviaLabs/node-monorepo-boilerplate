'use client';

import { Search, SlidersHorizontal } from 'lucide-react';

import { enterpriseInputClass } from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { TENANT_ROLES, ROLE_DISPLAY } from '~/types/tenant.types';

interface MembersTableToolbarProps {
  globalFilter: string;
  roleFilter: string;
  statusFilter: string;
  onSearchChange: (search: string) => void;
  onRoleChange: (role: string) => void;
  onStatusChange: (status: string) => void;
}

export function MembersTableToolbar({
  globalFilter,
  roleFilter,
  statusFilter,
  onSearchChange,
  onRoleChange,
  onStatusChange
}: MembersTableToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-1">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative group w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
          <Input
            key={globalFilter}
            placeholder="Search by name, email, or role..."
            defaultValue={globalFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`h-9 border-border/40 bg-card/40 transition-[background-color,border-color,box-shadow] duration-200 focus:bg-card focus:ring-1 focus:ring-primary/20 ${enterpriseInputClass} pl-9 pr-12 text-[13px]`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/50 bg-muted/40 text-[10px] font-medium text-muted-foreground pointer-events-none tracking-tight">
            <span className="text-[11px] leading-none">⌘</span>
            <span className="leading-none">K</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-dashed border-border/60 text-muted-foreground bg-secondary/10 hidden md:flex">
          <SlidersHorizontal className="h-3 w-3" />
          <span className="text-[11px] font-medium uppercase tracking-wider">Filters</span>
        </div>
        <Select value={roleFilter} onValueChange={onRoleChange}>
          <SelectTrigger
            className={`h-9 w-[135px] border-border/40 bg-card/40 transition-[background-color] duration-150 hover:bg-card/60 ${enterpriseInputClass} text-[13px]`}
          >
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {Object.entries(TENANT_ROLES).map(([, value]) => (
              <SelectItem key={value} value={value}>
                {ROLE_DISPLAY[value].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger
            className={`h-9 w-[135px] border-border/40 bg-card/40 transition-all hover:bg-card/60 ${enterpriseInputClass} text-[13px]`}
          >
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
