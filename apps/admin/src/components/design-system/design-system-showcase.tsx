'use client';

import {
  Bell,
  BarChart3,
  Building2,
  ChevronDown,
  Command,
  MoreHorizontal,
  Search,
  Settings2,
  Shield,
  UserRound
} from 'lucide-react';
import React from 'react';

import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Separator } from '~/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '~/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/utils';

const rows = [
  { name: 'Mivia Labs', environment: 'Production', status: 'Healthy', users: '142' },
  { name: 'Platform Ops', environment: 'Staging', status: 'Review', users: '23' },
  { name: 'Shared Services', environment: 'Sandbox', status: 'Draft', users: '7' }
];

const navigationItems = [
  { label: 'Inbox', icon: Bell, active: true, badge: '12' },
  { label: 'Statistics', icon: BarChart3, active: false },
  { label: 'Tenants', icon: Building2, active: false },
  { label: 'Users', icon: UserRound, active: false },
  { label: 'Memberships', icon: Shield, active: false },
  { label: 'Invitations', icon: Bell, active: false },
  { label: 'Health', icon: Shield, active: false },
  { label: 'Profile', icon: UserRound, active: false },
  { label: 'Settings', icon: Settings2, active: false }
];

const stats = [
  { label: 'Active organizations', value: '214', detail: '+8 this week' },
  { label: 'Pending reviews', value: '19', detail: '4 require approval' },
  { label: 'Operator sessions', value: '82', detail: '2 elevated' }
];

const statColorExamples = [
  {
    label: 'Neutral',
    value: '214',
    detail: 'Default system summary',
    className: 'border-border/70 bg-[hsl(var(--panel-elevated))]'
  },
  {
    label: 'Blue',
    value: '82%',
    detail: 'Primary emphasis',
    className: 'border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.1)]'
  },
  {
    label: 'Green',
    value: '99.2%',
    detail: 'Healthy or complete',
    className: 'border-[hsl(152_42%_42%/0.28)] bg-[hsl(152_50%_92%)] dark:bg-[hsl(152_38%_18%)]'
  },
  {
    label: 'Amber',
    value: '7',
    detail: 'Needs attention',
    className: 'border-[hsl(38_88%_48%/0.24)] bg-[hsl(42_100%_94%)] dark:bg-[hsl(38_62%_18%)]'
  },
  {
    label: 'Red',
    value: '2',
    detail: 'Blocked or risky',
    className:
      'border-[hsl(var(--destructive)/0.24)] bg-[hsl(var(--destructive)/0.08)] dark:bg-[hsl(var(--destructive)/0.14)]'
  }
] as const;

function AppSidebarPreview({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className={cn(
        'premium-panel panel-elevated flex h-full flex-col border-border/70',
        collapsed ? 'w-[76px] p-3' : 'w-full p-4'
      )}
    >
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="h-4 w-4" />
          </div>
          {!collapsed ? (
            <div className="space-y-0.5">
              <p className="text-sm font-semibold tracking-[-0.015em] text-foreground">
                Control Center
              </p>
              <p className="text-xs text-muted-foreground">Shared administration</p>
            </div>
          ) : null}
        </div>

        {!collapsed ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
            <ChevronDown className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {!collapsed ? (
        <>
          <div className="mt-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search" />
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="px-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Workspace
            </div>
            <div className="space-y-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                      item.active
                        ? 'border-primary/25 bg-primary/12 text-foreground'
                        : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-secondary/70 hover:text-foreground'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span className="rounded-md border border-primary/25 bg-primary/16 px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 flex flex-1 flex-col items-center gap-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
                  item.active
                    ? 'border-primary/25 bg-primary/14 text-foreground'
                    : 'border-transparent bg-transparent text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-auto pt-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'panel-muted flex w-full items-center rounded-lg border text-left transition-colors',
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-3'
              )}
            >
              <Avatar className="h-9 w-9 border border-border/80">
                <AvatarFallback className="bg-primary/14 text-[11px] font-semibold text-foreground">
                  AK
                </AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">Anita Kerr</p>
                    <p className="truncate text-xs text-muted-foreground">System administrator</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Theme settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AppHeaderPreview() {
  return (
    <div className="premium-panel flex flex-col gap-3 border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Overview</p>
        <h3 className="text-[1.05rem] font-semibold tracking-[-0.015em] text-foreground">Inbox</h3>
      </div>

      <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
        <Button variant="outline" size="sm">
          Export
        </Button>
        <Button size="sm" className="px-3">
          New action
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function DashboardPanelsPreview() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="premium-panel border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-[1.7rem] tracking-tighter">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{stat.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="premium-panel border-border/70">
          <CardHeader>
            <CardTitle>Organization activity</CardTitle>
            <CardDescription>
              Compact table density with smaller status chips and overflow row actions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-10 px-3">Name</TableHead>
                  <TableHead className="h-10 px-3">Environment</TableHead>
                  <TableHead className="h-10 px-3">Status</TableHead>
                  <TableHead className="h-10 px-3">Users</TableHead>
                  <TableHead className="h-10 px-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="px-3 py-2.5 font-medium">{row.name}</TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground">
                      {row.environment}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <Badge variant="outline" className="px-1.5 py-0.5 text-[9px] uppercase">
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2.5">{row.users}</TableCell>
                    <TableCell className="px-3 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>View details</DropdownMenuItem>
                          <DropdownMenuItem>Edit organization</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>Delete organization</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="premium-panel border-border/70">
          <CardHeader>
            <CardTitle>Operator profile</CardTitle>
            <CardDescription>
              Settings form treatment for profile and account screens.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input defaultValue="Anita" />
              <Input defaultValue="Kerr" />
            </div>
            <Input defaultValue="anita.kerr@mivialabs.com" />
            <Select defaultValue="admin">
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">System administrator</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline">Cancel</Button>
              <Button>Save profile</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ShellPreview() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Badge variant="secondary" className="w-fit">
            Authenticated Shell
          </Badge>
          <h2 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-foreground">
            Sidebar, app header, and dashboard rhythm
          </h2>
          <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
            Preview for the forthcoming protected area with a fixed full-height sidebar, account
            menu, and document-scrolling content layout.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_88px_minmax(0,1fr)]">
        <AppSidebarPreview />
        <AppSidebarPreview collapsed />

        <div className="space-y-4">
          <AppHeaderPreview />
          <DashboardPanelsPreview />
        </div>
      </div>
    </section>
  );
}

function TypographyPreview() {
  return (
    <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <Card className="premium-panel">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Typography
          </Badge>
          <CardTitle>IBM Plex Sans baseline</CardTitle>
          <CardDescription>
            Admin typography now favors steadier rhythm, readable body copy, and less
            aggressive tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Heading scale
            </p>
            <div className="space-y-2">
              <p className="text-[1.85rem] font-semibold tracking-tight text-foreground">
                Operational decisions should feel clear.
              </p>
              <p className="text-[1.35rem] font-semibold tracking-[-0.02em] text-foreground">
                Section headings stay calm and direct.
              </p>
              <p className="text-[1.05rem] font-semibold tracking-[-0.015em] text-foreground">
                Component titles carry structure without shouting.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Reading rhythm
            </p>
            <p className="text-[15px] leading-7 text-muted-foreground">
              Body copy uses a slightly larger baseline with relaxed line height so tables, forms,
              and operational detail panels feel easier to scan over long sessions.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Body
                </p>
                <p className="mt-2 text-sm text-foreground">
                  14px for controls and dense utility copy.
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Reading
                </p>
                <p className="mt-2 text-[15px] leading-7 text-foreground">
                  15px for descriptions and longer supporting text.
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Labels
                </p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-foreground">
                  Compact but still legible.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="premium-panel">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Applied sample
          </Badge>
          <CardTitle>Current shell typography in context</CardTitle>
          <CardDescription>
            Representative combinations for page headers, supporting copy, and compact metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Operations
            </p>
            <h3 className="mt-2 text-[1.5rem] font-semibold tracking-tight text-foreground">
              Review exceptions before rollout.
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-7 text-muted-foreground">
              IBM Plex Sans keeps the shell feeling technical and stable, while the revised spacing
              prevents dashboards from collapsing into dense, low-contrast text blocks.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel))] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Queue status
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">12 pending approvals</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Recommended for compact cards and metadata groups.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel))] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Supporting copy
              </p>
              <p className="mt-2 text-[15px] leading-7 text-foreground">
                Use the reading size when operators need to absorb instructions or system context.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function DesignSystemShowcase() {
  return (
    <TooltipProvider>
      <div className="space-y-6">
        <TypographyPreview />

        <ShellPreview />

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="premium-panel">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Statistics
              </Badge>
              <CardTitle>Color-backed stat surfaces</CardTitle>
              <CardDescription>
                Reference backgrounds for neutral, informative, success, warning, and critical
                summary blocks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {statColorExamples.map((item) => (
                  <div
                    key={item.label}
                    className={cn('rounded-lg border px-4 py-4 shadow-none', item.className)}
                  >
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 text-[1.55rem] font-semibold tracking-tight text-foreground">
                      {item.value}
                    </p>
                    <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-[13px] leading-6 text-muted-foreground">
                Use color only to distinguish meaning, not to decorate. Keep these surfaces compact
                and pair them with clear labels.
              </p>
            </CardContent>
          </Card>

          <Card className="premium-panel premium-feature-panel">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Context Surface
              </Badge>
              <CardTitle>Structured context surface</CardTitle>
              <CardDescription>
                Higher-emphasis surface for auth context, status highlights, and selected supporting
                moments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium tracking-[-0.015em] text-foreground">
                  Clean spotlight treatment with structure, not noise
                </p>
                <p className="text-[15px] leading-7 text-secondary">
                  Reserved for focused moments so the rest of the product can stay calm, bright, and
                  operational.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Auth</Badge>
                <Badge variant="secondary">Structured</Badge>
                <Badge variant="secondary">Focused</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="premium-panel">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Surface
              </Badge>
              <CardTitle>Control and surface baseline</CardTitle>
              <CardDescription>
                Reference styling for primary actions, secondary controls, and panel hierarchy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <Button>Save changes</Button>
                <Button variant="outline">Secondary action</Button>
                <Button variant="ghost">Ghost action</Button>
                <Button variant="destructive">Delete</Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="name@company.com" />
                <Select defaultValue="production">
                  <SelectTrigger>
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="access">Access</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="text-sm text-muted-foreground">
                  Baseline tab styling for settings and detail screens.
                </TabsContent>
                <TabsContent value="activity" className="text-sm text-muted-foreground">
                  Activity content preview.
                </TabsContent>
                <TabsContent value="access" className="text-sm text-muted-foreground">
                  Access control content preview.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="premium-panel">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Overlays
              </Badge>
              <CardTitle>Menus, dialogs, and tooltips</CardTitle>
              <CardDescription>Standard chrome for transient UI in the admin.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Open dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Transfer ownership</DialogTitle>
                    <DialogDescription>
                      Confirm the new owner before completing the change.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="owner@company.com" />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline">Cancel</Button>
                      <Button>Confirm transfer</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Edit project</DropdownMenuItem>
                  <DropdownMenuItem>View audit log</DropdownMenuItem>
                  <DropdownMenuItem>Archive</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost">Hover target</Button>
                </TooltipTrigger>
                <TooltipContent>Tooltip styling baseline.</TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>

          <Card className="premium-panel">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Page patterns
              </Badge>
              <CardTitle>Header and profile split</CardTitle>
              <CardDescription>
                Supporting components for dashboard and account pages inside the shell.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="panel-muted flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Account
                  </p>
                  <p className="text-[1.05rem] font-semibold tracking-[-0.015em] text-foreground">
                    Profile settings
                  </p>
                </div>
                <Badge variant="secondary">Synced</Badge>
              </div>

              <Separator />

              <div className="panel-soft rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-border/80">
                    <AvatarFallback className="bg-primary/14 text-[11px] font-semibold text-foreground">
                      AK
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-foreground">Anita Kerr</p>
                    <p className="text-xs text-muted-foreground">System administrator</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </TooltipProvider>
  );
}
