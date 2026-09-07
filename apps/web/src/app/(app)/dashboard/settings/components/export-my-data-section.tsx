'use client';

/**
 * Export My Data Section
 *
 * Allows users to export all their personal data.
 */

import { Download, FileJson, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { useAuth } from '~/hooks/use-auth';
import { authApi } from '~/lib/api/auth-api';
import { ExportStatus, type UserDataExport } from '~/types/gdpr.types';

/**
 * Format date for display
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'Invalid date';
  }
}

/**
 * Download JSON file with user data
 */
function downloadJson(data: UserDataExport, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export My Data Section Component
 *
 * Allows users to download their complete personal data including profile,
 * identities, and organization information.
 *
 * This component:
 * - Initiates data export via authApi.exportUserData()
 * - Handles loading and error states
 * - Displays download link when export is complete
 * - Shows confirmation modal before download
 *
 * @returns JSX element containing export button and results display
 */
export function ExportMyDataSection() {
  const { user } = useAuth();
  const [exportStatus, setExportStatus] = useState<ExportStatus>(ExportStatus.IDLE);
  const [exportData, setExportData] = useState<UserDataExport | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleExport = useCallback(async () => {
    if (!user?.userId || !user.tenantId) {
      toast.error('Session expired', {
        description: 'Please log in again to export your data.'
      });
      return;
    }

    setExportStatus(ExportStatus.LOADING);

    try {
      const data = await authApi.exportUserData(user.userId.toString(), undefined, user.tenantId);

      setExportData(data);
      setExportStatus(ExportStatus.SUCCESS);
      setShowModal(true);

      toast.success('Data export ready', {
        description: 'Your data has been retrieved successfully.'
      });
    } catch (error) {
      setExportStatus(ExportStatus.ERROR);
      const errorMessage = error instanceof Error ? error.message : 'Failed to export data';
      toast.error('Export failed', {
        description: errorMessage
      });
    }
  }, [user]);

  const handleDownload = useCallback(() => {
    if (!exportData) return;

    const filename = 'my-data-export-' + new Date().toISOString().split('T')[0] + '.json';
    downloadJson(exportData, filename);

    toast.success('Download started', {
      description: 'Your data export file is being downloaded.'
    });
  }, [exportData]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    // Reset status after modal closes
    setTimeout(() => {
      setExportStatus(ExportStatus.IDLE);
    }, 300);
  }, []);

  const isLoading = exportStatus === ExportStatus.LOADING;

  return (
    <>
      <Card
        className={
          enterpriseCardVariants() + ' animate-in fade-in-0 slide-in-from-bottom-1 duration-300'
        }
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FileJson className="h-5 w-5" />
            Your Data
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Export a copy of the personal data stored for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <p className="text-sm text-foreground/85">
                You have the right to request a copy of all personal data we store about you. This
                includes:
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>Your profile information (email, name, verification status)</li>
                <li>Connected identity providers</li>
                <li>Organization membership details</li>
                <li>Account activity timestamps</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Your data will be provided in JSON format for portability.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isLoading}
              className="shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export Data
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export Data Modal */}
      <Dialog open={showModal} onOpenChange={handleCloseModal}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-border bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Your Data Export
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This is a complete copy of your personal data stored in our system.
            </DialogDescription>
          </DialogHeader>

          {exportData && (
            <div className="space-y-4">
              {/* Profile Section */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h3 className="mb-3 font-medium text-foreground">Profile</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">User ID</dt>
                  <dd className="font-mono text-foreground">{exportData.user.id}</dd>

                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-foreground">{exportData.user.email}</dd>

                  <dt className="text-muted-foreground">Display Name</dt>
                  <dd className="text-foreground">{exportData.user.displayName || 'Not set'}</dd>

                  <dt className="text-muted-foreground">Email Verified</dt>
                  <dd className="text-foreground">
                    <Badge variant={exportData.user.isVerified ? 'default' : 'secondary'}>
                      {exportData.user.isVerified ? 'Verified' : 'Not verified'}
                    </Badge>
                  </dd>

                  <dt className="text-muted-foreground">Account Status</dt>
                  <dd className="text-foreground">
                    <Badge variant={exportData.user.isActive ? 'default' : 'destructive'}>
                      {exportData.user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </dd>

                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-foreground">{formatDate(exportData.user.createdAt)}</dd>

                  <dt className="text-muted-foreground">Last Updated</dt>
                  <dd className="text-foreground">{formatDate(exportData.user.updatedAt)}</dd>

                  <dt className="text-muted-foreground">Last Sign In</dt>
                  <dd className="text-foreground">{formatDate(exportData.user.lastSignInAt)}</dd>
                </dl>
              </div>

              {/* Identities Section */}
              {exportData.identities.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <h3 className="mb-3 font-medium text-foreground">Connected Accounts</h3>
                  <div className="space-y-2">
                    {exportData.identities.map((identity, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded border border-border/50 bg-background/50 px-3 py-2"
                      >
                        <div>
                          <span className="font-medium capitalize text-foreground">
                            {identity.provider.replace('_', ' ')}
                          </span>
                          {identity.displayName && (
                            <span className="ml-2 text-sm text-muted-foreground">
                              ({identity.displayName})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={identity.emailVerified ? 'default' : 'secondary'}>
                            {identity.emailVerified ? 'Verified' : 'Unverified'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Added {formatDate(identity.createdAt).split(',')[0]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Organization Section */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h3 className="mb-3 font-medium text-foreground">Organization</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Organization ID</dt>
                  <dd className="font-mono text-foreground">{exportData.organization.id}</dd>

                  <dt className="text-muted-foreground">Organization Name</dt>
                  <dd className="text-foreground">{exportData.organization.name}</dd>
                </dl>
              </div>

              {/* Export Metadata */}
              <div className="rounded-lg border border-dashed border-border bg-muted/10 p-4">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Export Metadata</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Exported At</dt>
                  <dd className="text-foreground">{formatDate(exportData.exportedAt)}</dd>

                  <dt className="text-muted-foreground">Exported By</dt>
                  <dd className="font-mono text-foreground">{exportData.exportedBy}</dd>
                </dl>
              </div>

              {/* Download Button */}
              <div className="flex justify-end pt-2">
                <Button onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download JSON
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
