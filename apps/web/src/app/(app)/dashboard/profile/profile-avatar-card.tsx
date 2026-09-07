'use client';

import { Camera, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useId, useState } from 'react';
import { toast } from 'sonner';

import type { ChangeEvent } from 'react';
import type { IUserProfileResponse } from '~/types/auth.types';

import { CurrentUserAvatar } from '~/components/auth/current-user-avatar';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { useAuth } from '~/hooks/use-auth';
import { normalizeApiErrorMessage } from '~/lib/api/auth-api';

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

type UploadReservation = {
  file: { id: number };
  upload: {
    url: string;
    headers?: Record<string, string>;
  };
};

function unwrapApiData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

export function ProfileAvatarCard({
  initialDisplayName,
  initialEmail,
  initialPhotoUrl
}: {
  initialDisplayName: string;
  initialEmail: string;
  initialPhotoUrl?: string | null;
}) {
  const router = useRouter();
  const fileInputId = useId();
  const { user, applyUserProfile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const currentDisplayName = user?.displayName ?? user?.name ?? initialDisplayName;
  const currentEmail = user?.email ?? initialEmail;
  const currentPhotoUrl = previewUrl ?? user?.photoUrl ?? (user ? undefined : initialPhotoUrl);
  const hasAttachedAvatar = user?.avatarFileId != null;
  const isBusy = isUploading || isRemoving;

  const syncProfile = async (profile: IUserProfileResponse) => {
    await applyUserProfile(profile);
    setPreviewUrl(null);
    router.refresh();
  };

  const uploadAvatar = async (file: File) => {
    const reserveResponse = await fetch('/api/storage/uploads', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        purpose: 'user_avatar',
        originalFilename: file.name,
        mimeType: file.type,
        byteSize: file.size,
        transport: 'api_proxy'
      })
    });

    const reservePayload = await reserveResponse
      .json()
      .catch(() => ({ message: 'Failed to reserve upload' }));
    if (!reserveResponse.ok) {
      throw new Error(normalizeApiErrorMessage(reservePayload, reserveResponse.status));
    }

    const reservation = unwrapApiData<UploadReservation>(reservePayload);
    const uploadHeaders = new Headers(reservation.upload.headers ?? {});
    uploadHeaders.set('content-type', file.type || 'application/octet-stream');
    uploadHeaders.set('content-length', String(file.size));

    const uploadResponse = await fetch(`/api/storage/uploads/${reservation.file.id}/content`, {
      method: 'PUT',
      credentials: 'include',
      headers: uploadHeaders,
      body: file
    });
    const uploadPayload = await uploadResponse
      .json()
      .catch(() => ({ message: 'Failed to upload avatar bytes' }));
    if (!uploadResponse.ok) {
      throw new Error(normalizeApiErrorMessage(uploadPayload, uploadResponse.status));
    }

    const attachResponse = await fetch('/api/auth/me/avatar', {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: reservation.file.id
      })
    });
    const attachPayload = await attachResponse
      .json()
      .catch(() => ({ message: 'Failed to attach avatar' }));
    if (!attachResponse.ok) {
      throw new Error(normalizeApiErrorMessage(attachPayload, attachResponse.status));
    }

    return unwrapApiData<IUserProfileResponse>(attachPayload);
  };

  const removeAvatar = async () => {
    const removeResponse = await fetch('/api/auth/me/avatar', {
      method: 'DELETE',
      credentials: 'include'
    });
    const removePayload = await removeResponse
      .json()
      .catch(() => ({ message: 'Failed to remove avatar' }));
    if (!removeResponse.ok) {
      throw new Error(normalizeApiErrorMessage(removePayload, removeResponse.status));
    }

    return unwrapApiData<IUserProfileResponse>(removePayload);
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Invalid avatar file', {
        description: 'Choose an image file.'
      });
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error('Avatar is too large', {
        description: 'Choose an image smaller than 2 MB.'
      });
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    setIsUploading(true);

    try {
      const profile = await uploadAvatar(file);
      await syncProfile(profile);
      URL.revokeObjectURL(nextPreviewUrl);
      toast.success('Avatar updated');
    } catch (error) {
      setPreviewUrl(null);
      URL.revokeObjectURL(nextPreviewUrl);
      toast.error('Avatar upload failed', {
        description: error instanceof Error ? error.message : 'Upload failed'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const onRemoveAvatar = async () => {
    if (!hasAttachedAvatar || isBusy) {
      return;
    }

    setIsRemoving(true);
    try {
      const profile = await removeAvatar();
      await syncProfile(profile);
      toast.success('Avatar removed');
    } catch (error) {
      toast.error('Avatar removal failed', {
        description: error instanceof Error ? error.message : 'Removal failed'
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Card
      className={`${enterpriseCardVariants()} animate-in fade-in-0 slide-in-from-bottom-1 duration-300`}
    >
      <CardHeader>
        <CardTitle className="text-base">Profile Photo</CardTitle>
        <CardDescription>
          Upload a square image for your workspace profile. Supported size: up to 2 MB. Uploading a
          new avatar replaces the current one.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <CurrentUserAvatar
              displayName={currentDisplayName}
              email={currentEmail}
              photoUrl={currentPhotoUrl}
              className="h-20 w-20 rounded-2xl border border-border/60 shadow-xs"
              fallbackClassName="rounded-2xl bg-linear-to-br from-secondary/50 to-secondary text-lg font-bold"
            />
            <div className="absolute -bottom-1 -right-1 rounded-full border border-background bg-card p-1.5 shadow-xs">
              <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{currentDisplayName || 'User'}</p>
            <p className="text-xs text-muted-foreground">{currentEmail}</p>
            <p className="text-xs text-muted-foreground">
              Changes apply after the backend confirms the avatar attachment.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            id={fileInputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onFileChange}
            disabled={isBusy}
          />
          <Button asChild disabled={isBusy}>
            <label htmlFor={fileInputId} className="cursor-pointer">
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-2 h-4 w-4" />
              )}
              {isUploading ? 'Uploading...' : 'Upload avatar'}
            </label>
          </Button>
          {hasAttachedAvatar ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void onRemoveAvatar();
              }}
              disabled={isBusy}
            >
              {isRemoving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {isRemoving ? 'Removing...' : 'Remove avatar'}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
