'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { FormEvent } from 'react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { tenantApi } from '~/lib/api/tenant-api';
import { iconSwapTransition, iconSwapVariants, standardTransition } from '~/lib/motion';

const DISPLAY_NAME_MIN_LENGTH = 1;
const DISPLAY_NAME_MAX_LENGTH = 255;

export function OrganizationSettingsForm({
  tenantId,
  tenantSlug,
  tenantName,
  initialDisplayName
}: {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialDisplayName: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [isSaving, setIsSaving] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [savedDisplayName, setSavedDisplayName] = useState(initialDisplayName.trim());

  const trimmedDisplayName = displayName.trim();
  const validationError = useMemo(() => {
    if (trimmedDisplayName.length < DISPLAY_NAME_MIN_LENGTH) {
      return 'Display name is required';
    }

    if (trimmedDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
      return `Display name must not exceed ${DISPLAY_NAME_MAX_LENGTH} characters`;
    }

    return null;
  }, [trimmedDisplayName]);

  const hasChanges = trimmedDisplayName !== savedDisplayName;
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSubmitted(true);

    if (validationError) {
      toast.error('Please fix validation errors');
      return;
    }

    if (!hasChanges) {
      toast.message('No changes to save');
      return;
    }

    setIsSaving(true);
    try {
      await tenantApi.updateTenantSettings(
        {
          displayName: trimmedDisplayName
        },
        tenantId
      );

      toast.success('Organization display name updated');
      setSavedDisplayName(trimmedDisplayName);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update organization display name';
      toast.error('Update failed', {
        description: message
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        className={`${enterpriseCardVariants()} animate-in fade-in-0 slide-in-from-bottom-1 duration-300`}
      >
        <CardHeader>
          <CardTitle className="text-base">Organization Profile</CardTitle>
          <CardDescription>
            Update the public workspace display name shown across dashboards and invitations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Immutable
              </p>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tenantName">Tenant Name</Label>
                  <Input id="tenantName" value={tenantName} disabled readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tenantId">Tenant ID</Label>
                  <Input id="tenantId" value={tenantId} disabled readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tenantSlug">Organization Slug</Label>
                  <Input id="tenantSlug" value={tenantSlug || 'N/A'} disabled readOnly />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-card/70 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Editable
                </p>
                <p className="text-xs text-muted-foreground">
                  {trimmedDisplayName.length}/{DISPLAY_NAME_MAX_LENGTH}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => {
                    setHasInteracted(true);
                    setDisplayName(event.target.value);
                  }}
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  disabled={isSaving}
                />
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {(hasInteracted || hasSubmitted) && validationError ? (
                  <motion.p
                    key="display-name-error"
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                    transition={standardTransition}
                    className="mt-2 text-sm font-medium text-red-600 dark:text-red-400"
                  >
                    {validationError}
                  </motion.p>
                ) : (
                  <motion.p
                    key="display-name-hint"
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                    transition={standardTransition}
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    Keep this concise and recognizable for your team.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                {hasChanges
                  ? 'You have unsaved profile changes.'
                  : 'All profile changes are saved.'}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving || !hasChanges}
                  onClick={() => {
                    setDisplayName(savedDisplayName);
                    setHasInteracted(false);
                    setHasSubmitted(false);
                  }}
                >
                  Discard
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving || !hasChanges || validationError !== null}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {isSaving ? (
                      <motion.span
                        key="saving"
                        variants={iconSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={iconSwapTransition}
                        className="inline-flex items-center"
                      >
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        variants={iconSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={iconSwapTransition}
                        className="inline-flex items-center"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save changes
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
