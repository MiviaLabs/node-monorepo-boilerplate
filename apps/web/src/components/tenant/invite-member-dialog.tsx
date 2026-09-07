'use client';

/**
 * Invite Member Dialog Component
 *
 * Modal dialog for inviting new members to the tenant
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, Loader2, Mail, MessageSquare, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '~/components/ui/dialog';
import {
  enterpriseInputClass,
  enterpriseOutlineButtonClass
} from '~/components/ui/enterprise-styles';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { useAuth } from '~/hooks/use-auth';
import {
  alertVariants,
  fadeInUp,
  formContainer,
  formFieldVariants,
  iconSwapVariants,
  iconSwapTransition,
  standardTransition
} from '~/lib/motion';
import {
  TENANT_ROLES,
  ROLE_DISPLAY,
  type InviteMemberInput,
  type InviteMemberResponse,
  type TenantRole
} from '~/types/tenant.types';
import { api } from '~/utils/api';

/**
 * Invite member form schema
 */
const inviteMemberSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  role: z.enum([TENANT_ROLES.OWNER, TENANT_ROLES.ADMIN, TENANT_ROLES.USER, TENANT_ROLES.VIEWER]),
  message: z.string().optional()
});

export type InviteMemberFormData = z.infer<typeof inviteMemberSchema>;

/**
 * Props
 */
interface InviteMemberDialogProps {
  onInviteSuccess?: () => Promise<void> | void;
  trigger?: React.ReactNode;
}

/**
 * Invite Member Dialog Component
 */
export function InviteMemberDialog({ onInviteSuccess, trigger }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();

  const form = useForm<InviteMemberFormData>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      email: '',
      role: TENANT_ROLES.USER,
      message: ''
    }
  });

  // Use tRPC mutation for inviting member
  const utils = api.useUtils();

  const inviteMemberMutation = api.members.inviteMember.useMutation({
    onSuccess: async (result: InviteMemberResponse) => {
      setError(null);
      await utils.members.getMembers.invalidate();
      await onInviteSuccess?.();

      if (result.invitationToken) {
        const tenantId =
          user?.tenantId ??
          document.cookie
            .split('; ')
            .find((cookie) => cookie.startsWith('tenantId='))
            ?.split('=')[1];

        if (tenantId) {
          const link = `${window.location.origin}/invitations/accept?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(result.invitationToken)}`;
          setInvitationLink(link);
          setCopied(false);
          return;
        }
      }

      // Reset form and close dialog when no manual-share link is available.
      form.reset();
      setInvitationLink(null);
      setOpen(false);
    },
    onError: (err) => {
      setError(err.message || 'Failed to invite member');
    }
  });

  const onSubmit = async (data: InviteMemberFormData) => {
    setError(null);

    const input: InviteMemberInput = {
      email: data.email,
      roles: [data.role as TenantRole],
      message: data.message ?? undefined
    };

    inviteMemberMutation.mutate(input);
  };

  const copyInvitationLink = async () => {
    if (!invitationLink) return;

    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopied(true);
    } catch {
      setError('Failed to copy invitation link');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setInvitationLink(null);
          setCopied(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Send className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-card text-card-foreground sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-foreground">Invite New Member</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Send an invitation to join your tenant. The invited user will receive an email with
            instructions to accept.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {invitationLink ? (
            <motion.div
              key="invitation-link-view"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={standardTransition}
              className="space-y-4"
            >
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                Share this invitation link manually if the recipient cannot access the email invite.
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Invitation Link</label>
                <Input value={invitationLink} readOnly className={enterpriseInputClass} />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyInvitationLink}
                  className={enterpriseOutlineButtonClass}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {copied ? (
                      <motion.div
                        key="check-icon"
                        variants={iconSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={iconSwapTransition}
                        className="mr-2 flex items-center"
                      >
                        <Check className="h-4 w-4" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="copy-icon"
                        variants={iconSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={iconSwapTransition}
                        className="mr-2 flex items-center"
                      >
                        <Copy className="h-4 w-4" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {copied ? 'Copied' : 'Copy Link'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    form.reset();
                    setInvitationLink(null);
                    setError(null);
                    setOpen(false);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <Form {...form}>
              <motion.form
                key="invitation-form-view"
                variants={formContainer}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={standardTransition}
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                {/* Email */}
                <motion.div variants={formFieldVariants}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="colleague@example.com"
                              className={`${enterpriseInputClass} pl-9`}
                              {...field}
                              disabled={inviteMemberMutation.isPending}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          The email address of the person you want to invite
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </motion.div>

                {/* Roles */}
                <motion.div variants={formFieldVariants}>
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <div className="mb-3">
                          <FormLabel>Role</FormLabel>
                          <FormDescription>Select one role for the new member</FormDescription>
                        </div>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={inviteMemberMutation.isPending}
                          >
                            <SelectTrigger className={enterpriseInputClass}>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(TENANT_ROLES).map(([, value]) => (
                                <SelectItem key={value} value={value}>
                                  {ROLE_DISPLAY[value].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription>{ROLE_DISPLAY[field.value].description}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </motion.div>

                {/* Personal Message (Optional) */}
                <motion.div variants={formFieldVariants}>
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Personal Message (Optional)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Textarea
                              placeholder="Add a personal note to your invitation..."
                              className={`min-h-[80px] resize-none ${enterpriseInputClass} pl-9`}
                              {...field}
                              disabled={inviteMemberMutation.isPending}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          A personal message to include with the invitation
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </motion.div>

                {/* Error Display */}
                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      key="error-message"
                      variants={alertVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={standardTransition}
                      className="rounded-md border border-red-300/80 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-300"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div variants={formFieldVariants}>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      className={enterpriseOutlineButtonClass}
                      onClick={() => setOpen(false)}
                      disabled={inviteMemberMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={inviteMemberMutation.isPending}>
                      <AnimatePresence mode="wait" initial={false}>
                        {inviteMemberMutation.isPending ? (
                          <motion.div
                            key="loader-icon"
                            variants={iconSwapVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={iconSwapTransition}
                            className="mr-2 flex items-center"
                          >
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="send-icon"
                            variants={iconSwapVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={iconSwapTransition}
                            className="mr-2 flex items-center"
                          >
                            <Send className="h-4 w-4" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {inviteMemberMutation.isPending ? 'Sending...' : 'Send Invitation'}
                    </Button>
                  </DialogFooter>
                </motion.div>
              </motion.form>
            </Form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
