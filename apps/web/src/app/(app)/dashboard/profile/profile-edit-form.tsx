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
import {
  getTransition,
  getVariants,
  iconSwapTransition,
  iconSwapVariants,
  standardTransition
} from '~/lib/motion';
import { api } from '~/utils/api';

const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 50;
const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function ProfileEditForm({
  initialDisplayName,
  initialPhoneNumber
}: {
  initialDisplayName: string;
  initialPhoneNumber: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const updateProfileMutation = api.auth.updateMyProfile.useMutation({
    onSuccess: async () => {
      await utils.auth.getMe.invalidate();
      toast.success('Profile updated');
      setDisplayName(trimmedDisplayName);
      setPhoneNumber(trimmedPhoneNumber);
      router.refresh();
    },
    onError: (error) => {
      toast.error('Update failed', {
        description: error.message
      });
    }
  });
  const isSaving = updateProfileMutation.isPending;

  const trimmedDisplayName = displayName.trim();
  const trimmedPhoneNumber = phoneNumber.trim();
  const validationError = useMemo(() => {
    if (trimmedDisplayName.length === 0) {
      return 'Display name is required';
    }
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
  }, [trimmedDisplayName, trimmedPhoneNumber]);

  const hasChanges =
    trimmedDisplayName !== initialDisplayName.trim() ||
    trimmedPhoneNumber !== initialPhoneNumber.trim();
  const inlineMessageVariants = getVariants({
    initial: { opacity: 0, y: -4, filter: 'blur(2px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -3, filter: 'blur(2px)' }
  });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (validationError) {
      toast.error('Please fix validation errors');
      return;
    }

    if (!hasChanges) {
      toast.message('No changes to save');
      return;
    }

    await updateProfileMutation.mutateAsync({
      displayName: trimmedDisplayName,
      phoneNumber: trimmedPhoneNumber || ''
    });
  };

  return (
    <Card
      className={`${enterpriseCardVariants()} animate-in fade-in-0 slide-in-from-bottom-1 duration-300`}
    >
      <CardHeader>
        <CardTitle className="text-base">Edit Profile</CardTitle>
        <CardDescription>Update how your name appears across your workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              disabled={isSaving}
            />
            <AnimatePresence initial={false}>
              {validationError ? (
                <motion.p
                  key="display-name-error"
                  className="text-sm font-medium text-red-600 dark:text-red-400"
                  variants={inlineMessageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={getTransition(standardTransition)}
                >
                  {validationError}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone number</Label>
            <Input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              inputMode="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+14155552671"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">Use international E.164 format.</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              {hasChanges ? 'You have unsaved profile changes.' : 'All profile changes are saved.'}
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !hasChanges || validationError !== null}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isSaving ? (
                  <motion.span
                    key="saving-icon"
                    variants={getVariants(iconSwapVariants)}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={getTransition(iconSwapTransition)}
                    className="mr-2 inline-flex"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="save-icon"
                    variants={getVariants(iconSwapVariants)}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={getTransition(iconSwapTransition)}
                    className="mr-2 inline-flex"
                  >
                    <Save className="h-4 w-4" />
                  </motion.span>
                )}
              </AnimatePresence>
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
