'use client';

import { Building2, Loader2, Mail, Pencil, Phone, RotateCcw, Save, Shield, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { api } from '~/utils/api';

const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 50;
const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function ProfileEditForm({
  initialDisplayName,
  initialPhoneNumber,
  email,
  roleLabel,
  roles,
  tenantDisplayName,
  tenantId
}: {
  initialDisplayName: string;
  initialPhoneNumber: string;
  email: string;
  roleLabel: string;
  roles: string[];
  tenantDisplayName: string;
  tenantId: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [editingField, setEditingField] = useState<'displayName' | 'phoneNumber' | null>(null);

  const trimmedDisplayName = displayName.trim();
  const trimmedPhoneNumber = phoneNumber.trim();
  const validationError = (() => {
    if (trimmedDisplayName.length < DISPLAY_NAME_MIN_LENGTH) {
      return `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters`;
    }
    if (trimmedDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
      return `Display name must not exceed ${DISPLAY_NAME_MAX_LENGTH} characters`;
    }
    if (trimmedPhoneNumber.length > 0 && !PHONE_E164_REGEX.test(trimmedPhoneNumber)) {
      return 'Phone number must be in E.164 format (for example: +14155552671)';
    }

    return null;
  })();

  const hasChanges =
    trimmedDisplayName !== initialDisplayName.trim() ||
    trimmedPhoneNumber !== initialPhoneNumber.trim();

  const updateProfileMutation = api.auth.updateMyProfile.useMutation({
    onSuccess: async () => {
      setEditingField(null);
      await utils.auth.getMe.invalidate();
      toast.success('Profile updated');
      router.refresh();
    },
    onError: (error) => {
      toast.error('Update failed', {
        description: error.message
      });
    }
  });

  const resetForm = () => {
    setDisplayName(initialDisplayName);
    setPhoneNumber(initialPhoneNumber);
    setEditingField(null);
  };

  const cancelEditing = (field: 'displayName' | 'phoneNumber') => {
    if (field === 'displayName') {
      setDisplayName(initialDisplayName);
    } else {
      setPhoneNumber(initialPhoneNumber);
    }

    setEditingField(null);
  };

  return (
    <div className="space-y-6">
      <div className="divide-y divide-border/70 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))]">
        <div className="flex items-start gap-4 px-4 py-4">
          <div className="rounded-md border border-border/70 bg-[hsl(var(--control))] p-2">
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Display name
                </p>
                {editingField === 'displayName' ? null : (
                  <p className="text-sm font-medium text-foreground break-all">
                    {trimmedDisplayName}
                  </p>
                )}
              </div>
              {editingField === 'displayName' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => cancelEditing('displayName')}
                  disabled={updateProfileMutation.isPending}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setEditingField('displayName')}
                  disabled={updateProfileMutation.isPending}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
            {editingField === 'displayName' ? (
              <div className="space-y-2">
                <Label htmlFor="profile-display-name">Display name</Label>
                <Input
                  id="profile-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  disabled={updateProfileMutation.isPending}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-4 px-4 py-4">
          <div className="rounded-md border border-border/70 bg-[hsl(var(--control))] p-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Email</p>
            <p className="text-sm font-medium text-foreground break-all">{email}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 px-4 py-4">
          <div className="rounded-md border border-border/70 bg-[hsl(var(--control))] p-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Tenant</p>
            <p className="text-sm font-medium text-foreground break-all">{tenantDisplayName}</p>
            <p className="text-xs text-muted-foreground">{tenantId}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 px-4 py-4">
          <div className="rounded-md border border-border/70 bg-[hsl(var(--control))] p-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Phone
                </p>
                {editingField === 'phoneNumber' ? null : (
                  <p className="text-sm font-medium text-foreground break-all">
                    {trimmedPhoneNumber || 'Not set'}
                  </p>
                )}
              </div>
              {editingField === 'phoneNumber' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => cancelEditing('phoneNumber')}
                  disabled={updateProfileMutation.isPending}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setEditingField('phoneNumber')}
                  disabled={updateProfileMutation.isPending}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
            {editingField === 'phoneNumber' ? (
              <div className="space-y-2">
                <Label htmlFor="profile-phone-number">Phone number</Label>
                <Input
                  id="profile-phone-number"
                  type="tel"
                  inputMode="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="+14155552671"
                  disabled={updateProfileMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">Use international E.164 format.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-4 px-4 py-4">
          <div className="rounded-md border border-border/70 bg-[hsl(var(--control))] p-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Access</p>
            <p className="text-sm font-medium text-foreground break-all">{roleLabel}</p>
            <p className="text-xs text-muted-foreground">{roles.join(', ') || 'system operator'}</p>
          </div>
        </div>
      </div>

      {validationError ? (
        <p className="text-sm font-medium text-destructive">{validationError}</p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {hasChanges ? 'You have unsaved profile changes.' : 'All profile changes are saved.'}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={resetForm}
            disabled={updateProfileMutation.isPending || !hasChanges}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset changes
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={updateProfileMutation.isPending || !hasChanges || validationError !== null}
            onClick={() =>
              updateProfileMutation.mutate({
                displayName: trimmedDisplayName,
                phoneNumber: trimmedPhoneNumber
              })
            }
          >
            {updateProfileMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {updateProfileMutation.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
