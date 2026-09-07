'use client';

/**
 * Settings Page Client Component
 *
 * Client-side settings page component for user account management.
 * Displays account settings and dangerous operations such as account
 * deletion and data export.
 *
 * This component:
 * - Provides settings toggles and controls
 * - Handles account deletion flow with confirmation dialog
 *
 * @returns JSX element containing the settings page UI
 */

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Monitor, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ExportMyDataSection } from './components/export-my-data-section';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { ThemeToggle } from '~/components/theme-toggle';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { useAuth } from '~/hooks/use-auth';
import { userSettingsApi } from '~/lib/api/user-settings-api';
import { alertVariants, standardTransition } from '~/lib/motion';
import {
  normalizeCurrentUserSettings,
  type CurrentUserSettings,
  type DashboardDefaultViewKey
} from '~/lib/user-settings/current-user-settings';
import { TENANT_ROLES } from '~/types/tenant.types';

/**
 * Settings Page Component
 */
interface SettingsPageClientProps {
  initialSettings: CurrentUserSettings;
}

export function SettingsPageClient({ initialSettings }: SettingsPageClientProps) {
  const { user, deleteAccount } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const normalizedInitialSettings = useMemo(
    () => normalizeCurrentUserSettings(initialSettings),
    [initialSettings]
  );
  const [dashboardDefaultViewOverride, setDashboardDefaultViewOverride] =
    useState<DashboardDefaultViewKey | null>(null);
  const [isSavingDashboardDefaultView, setIsSavingDashboardDefaultView] = useState(false);
  const currentDashboardDefaultView =
    dashboardDefaultViewOverride ?? normalizedInitialSettings.dashboardDefaultView;

  const isOwner = user?.roles?.includes(TENANT_ROLES.OWNER) ?? false;
  const { canManageOrganization, canViewMembers, canViewProjects } = getDashboardRouteAccess({
    roles: user?.roles,
    permissions: user?.permissions
  });
  const dashboardDefaultViewOptions: Array<{
    value: DashboardDefaultViewKey;
    label: string;
    description: string;
  }> = [
    {
      value: 'dashboard',
      label: 'Dashboard overview',
      description: 'Stay on the dashboard summary page.'
    },
    ...(canViewProjects
      ? [
          {
            value: 'projects' as const,
            label: 'Projects',
            description: 'Open the projects list first.'
          }
        ]
      : []),
    ...(canViewMembers
      ? [
          {
            value: 'members' as const,
            label: 'Members',
            description: 'Open the members directory first.'
          }
        ]
      : []),
    {
      value: 'profile',
      label: 'Profile',
      description: 'Open your account profile first.'
    },
    {
      value: 'accountSettings',
      label: 'Account settings',
      description: 'Open your personal settings first.'
    },
    ...(canManageOrganization
      ? [
          {
            value: 'organizationSettings' as const,
            label: 'Organization settings',
            description: 'Open workspace administration first.'
          }
        ]
      : [])
  ];

  const handleDeleteAccount = async () => {
    if (!user?.userId) {
      toast.error('Invalid user session', {
        description: 'Please log in again to delete your account.'
      });
      setShowDeleteDialog(false);
      return;
    }

    setIsDeletingAccount(true);

    try {
      await deleteAccount(reason || undefined);
      setShowDeleteDialog(false);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleDashboardDefaultViewChange = async (nextValue: string) => {
    const dashboardDefaultView = nextValue as DashboardDefaultViewKey;
    const previousDashboardDefaultView = currentDashboardDefaultView;
    setDashboardDefaultViewOverride(dashboardDefaultView);
    setIsSavingDashboardDefaultView(true);

    try {
      const updatedSettings = await userSettingsApi.updateDashboardDefaultView(
        dashboardDefaultView,
        user?.tenantId
      );
      setDashboardDefaultViewOverride(
        updatedSettings.dashboardDefaultView === normalizedInitialSettings.dashboardDefaultView
          ? null
          : updatedSettings.dashboardDefaultView
      );
    } catch (error) {
      setDashboardDefaultViewOverride(
        previousDashboardDefaultView === normalizedInitialSettings.dashboardDefaultView
          ? null
          : previousDashboardDefaultView
      );
      toast.error('Failed to save dashboard landing page', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsSavingDashboardDefaultView(false);
    }
  };

  return (
    <div className="w-full space-y-5">
      <div className="space-y-4">
        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Monitor className="h-5 w-5" />
              Dashboard Preferences
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Saved per account within the current workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="dashboard-default-view" className="text-sm font-medium">
                  Dashboard landing page
                </Label>
                <p className="text-sm text-muted-foreground">
                  Choose which page opens first when you navigate to the dashboard entry route.
                </p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-start">
                <Select
                  value={currentDashboardDefaultView}
                  onValueChange={(value) => {
                    void handleDashboardDefaultViewChange(value);
                  }}
                  disabled={isSavingDashboardDefaultView}
                >
                  <SelectTrigger id="dashboard-default-view" aria-label="Dashboard landing page">
                    <SelectValue placeholder="Select landing page" />
                  </SelectTrigger>
                  <SelectContent>
                    {dashboardDefaultViewOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {dashboardDefaultViewOptions.find(
                    (option) => option.value === currentDashboardDefaultView
                  )?.description ?? 'Open the dashboard summary page.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" size="sm" disabled={isSavingDashboardDefaultView}>
                <Save className="mr-1.5 h-4 w-4" />
                {isSavingDashboardDefaultView ? 'Saving' : 'Auto-save active'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Monitor className="h-5 w-5" />
              Workspace Experience
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Account-level interface defaults for your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 transition-[border-color,background-color,box-shadow] duration-200 hover:border-border/90 hover:bg-muted/30">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Choose how the workspace interface appears for your account.
                </p>
              </div>
              <ThemeToggle compact />
            </div>
          </CardContent>
        </Card>

        <ExportMyDataSection />

        <Card
          className={
            enterpriseCardVariants() +
            ' border-red-200/80 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20'
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Irreversible actions that affect your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-medium text-red-700 dark:text-red-300">Delete Account</h3>
                <p className="mt-1 text-sm text-foreground/85 dark:text-destructive-foreground/90">
                  Permanently delete your account and all associated data. This action cannot be
                  undone.
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-800 dark:text-red-300/90">
                  <li>All personal account data is permanently removed.</li>
                  <li>Active sessions and API access are revoked.</li>
                  <li>Recovery is not possible after confirmation.</li>
                </ul>
                <AnimatePresence initial={false}>
                  {isOwner ? (
                    <motion.p
                      key="owner-danger-hint"
                      variants={alertVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={standardTransition}
                      className="mt-2 text-sm font-medium text-red-700 dark:text-red-200"
                    >
                      As the organization owner, deleting your account may affect your entire
                      workspace.
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isDeletingAccount}
                className="shrink-0"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeletingAccount ? 'Deleting...' : 'Delete Account'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete Account?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-muted-foreground">
              <p>
                This action cannot be undone. Your account and all data will be permanently deleted.
              </p>

              <AnimatePresence initial={false}>
                {isOwner ? (
                  <motion.div
                    key="owner-dialog-warning"
                    variants={alertVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={standardTransition}
                    className="rounded-md border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700/70 dark:bg-yellow-950/30"
                  >
                    <p className="font-medium text-yellow-800 dark:text-yellow-300">
                      Organization Owner Warning
                    </p>
                    <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                      You are the organization owner. Before deleting your account:
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-yellow-800 dark:text-yellow-200">
                      <li>If other members exist, you must transfer ownership first</li>
                      <li>If you are the sole member, the entire organization will be deleted</li>
                    </ul>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="space-y-2">
                <label htmlFor="reason" className="text-sm font-medium text-foreground/90">
                  Reason for deletion (optional)
                </label>
                <Textarea
                  id="reason"
                  placeholder="e.g., No longer needed, switching providers..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="resize-none border-border bg-background text-foreground"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAccount}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeletingAccount ? 'Deleting...' : 'Delete Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
