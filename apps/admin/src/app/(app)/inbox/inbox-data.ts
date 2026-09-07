const enum InboxCategoryKey {
  All = 'all',
  Approvals = 'approvals',
  Alerts = 'alerts',
  Notifications = 'notifications',
  Digests = 'digests'
}

const enum InboxItemKind {
  Approval = 'Approval',
  Alert = 'Alert',
  Notification = 'Notification',
  Digest = 'Digest'
}

const enum InboxPriority {
  High = 'High',
  Medium = 'Medium',
  Low = 'Low'
}

type InboxItem = {
  id: string;
  title: string;
  preview: string;
  body: string[];
  kind: InboxItemKind;
  source: string;
  owner: string;
  context: string;
  receivedAt: string;
  href: string;
  actionLabel: string;
  priority: InboxPriority;
  unread?: boolean;
};

type InboxCategory = {
  value: InboxCategoryKey;
  label: string;
};

const allInboxItems: InboxItem[] = [
  {
    id: 'policy-bundle-approval',
    title: 'Policy bundle approval required',
    preview: 'Security is waiting on final approval for `prod-2026.03.13.1`.',
    body: [
      'The production bundle passed validation and staged rollout checks, but it is still waiting on a system owner approval before publish. The policy team attached legal annotations, rollout notes, and a risk delta summary from the previous bundle.',
      'Scope changes affect tenant-owner escalation permissions, service account review windows, and one exception policy for EMEA support operators. No breaking auth regressions were detected in dry-run mode, but the team wants a manual review before publish.',
      'The attached review packet also includes an environment-by-environment comparison of rule changes, a list of principals that would gain broader access, and the rollback sequence prepared by the platform team if approval is withheld after the initial publish window opens.',
      'Two comments in the review thread still need an explicit decision. The first asks whether the temporary support escalation path should stay available for another week while the regional migration finishes. The second asks whether the stricter service-account review cadence should become mandatory for every tenant immediately or remain soft-enforced for one more release cycle.',
      'Security marked this item high priority because the bundle is already staged and downstream teams are waiting on the final decision to align their rollout windows. If approval is delayed, the team will have to restage the publish and re-run the compliance snapshot before tonight.',
      'Recommended action: review the staged bundle, verify the exception window, confirm whether the EMEA escalation rule should ship together with the access review updates, and decide if the stricter service-account cadence should be enforced immediately or phased in during the next bundle.'
    ],
    kind: InboxItemKind.Approval,
    source: 'Policy publish',
    owner: 'Security',
    context: 'Production access policies',
    receivedAt: '4m ago',
    href: '/health',
    actionLabel: 'Review bundle',
    priority: InboxPriority.High,
    unread: true
  },
  {
    id: 'identity-diff-review',
    title: 'Identity sync produced 12 diffs',
    preview: 'The EMEA admin group changed scope and needs operator confirmation.',
    body: [
      'Identity reconciliation detected twelve permission-level changes between the upstream provider and the internal tenant mapping. Most are expected group membership changes, but two elevated role assignments would widen access if accepted automatically.',
      'The drift appears to come from an upstream group rename and a follow-up membership import that ran outside the normal guarded workflow. IAM marked this for human review instead of writing back the new state.',
      'Recommended action: compare the provider group to the tenant role assignments, validate the two elevated mappings, and either confirm or revert the changes.'
    ],
    kind: InboxItemKind.Alert,
    source: 'Identity sync',
    owner: 'IAM',
    context: 'EMEA tenant sync',
    receivedAt: '10m ago',
    href: '/settings',
    actionLabel: 'Check settings',
    priority: InboxPriority.High,
    unread: true
  },
  {
    id: 'weekly-digest-ready',
    title: 'Weekly activity digest is ready',
    preview: 'Leadership summary has been prepared for distribution.',
    body: [
      'The weekly digest includes inbox volumes, approval throughput, service reliability, and tenant provisioning trends for the last five business days. Reporting completed successfully and the distribution list is ready.',
      'The summary highlights a drop in alert resolution time, a small increase in policy review backlog, and two provisioning flows that required operator intervention.',
      'Recommended action: skim the executive summary for unusual changes, then release it to the configured recipients.'
    ],
    kind: InboxItemKind.Digest,
    source: 'Reporting',
    owner: 'Operations',
    context: 'Executive weekly summary',
    receivedAt: '32m ago',
    href: '/statistics',
    actionLabel: 'Open statistics',
    priority: InboxPriority.Low
  },
  {
    id: 'tenant-provisioning-complete',
    title: 'Tenant provisioning completed',
    preview: 'Northwind Logistics finished baseline setup with no blockers.',
    body: [
      'Provisioning completed with the expected role mapping, tenant defaults, and starter notifications in place. No manual follow-up is required unless the onboarding owner wants to customize alert routing immediately.',
      'The tenant has one pending invitation that was intentionally left unsent until the customer admin confirms the final recipient list.'
    ],
    kind: InboxItemKind.Notification,
    source: 'Provisioning',
    owner: 'Platform',
    context: 'Northwind Logistics',
    receivedAt: '47m ago',
    href: '/inbox',
    actionLabel: 'View record',
    priority: InboxPriority.Low
  },
  {
    id: 'elevated-session-request',
    title: 'Elevated session request pending',
    preview: 'Operations requested temporary production access for the on-call rotation.',
    body: [
      'The on-call operator requested an elevated session for incident response. The access window is limited to two hours and is waiting on explicit owner acknowledgement before it can be granted.',
      'The request includes a linked incident, a proposed escalation path, and a note that read-only access is insufficient for the recovery step planned by the team.'
    ],
    kind: InboxItemKind.Approval,
    source: 'Access workflow',
    owner: 'Operations',
    context: 'On-call rotation',
    receivedAt: '21m ago',
    href: '/settings',
    actionLabel: 'Review access',
    priority: InboxPriority.Medium,
    unread: true
  },
  {
    id: 'notification-retry-breach',
    title: 'Notification retry threshold breached',
    preview: 'Delivery queue crossed the retry threshold twice in the last hour.',
    body: [
      'The notification dispatcher retried two batches beyond the acceptable limit. Delivery eventually completed, but reliability degraded enough that the queue should be inspected before the next digest cycle starts.',
      'The underlying cause appears to be a transient provider throttling window combined with an oversized batch from a catch-up job.'
    ],
    kind: InboxItemKind.Alert,
    source: 'Notifications',
    owner: 'Platform',
    context: 'Outbound delivery queue',
    receivedAt: '19m ago',
    href: '/health',
    actionLabel: 'Open health',
    priority: InboxPriority.Medium,
    unread: true
  },
  {
    id: 'role-export-delivered',
    title: 'Role export delivered',
    preview: 'Finance compliance roster was delivered to the archive destination.',
    body: [
      'The scheduled roster export completed and was archived to the configured destination. Delivery receipts and checksums are attached to the job record for audit review.',
      'No rows were rejected, and the downstream archive acknowledged the file within the expected SLA.'
    ],
    kind: InboxItemKind.Notification,
    source: 'Exports',
    owner: 'Compliance',
    context: 'Finance compliance roster',
    receivedAt: '1h ago',
    href: '/statistics',
    actionLabel: 'See delivery stats',
    priority: InboxPriority.Low
  },
  {
    id: 'digest-failed-send-review',
    title: 'Digest delivery needs confirmation',
    preview: 'One recipient group was skipped during the nightly digest send.',
    body: [
      'The nightly digest build succeeded, but one recipient group was excluded because the configured owner address bounced in the previous send window.',
      'The skipped group contains regional operations leads, so the missing delivery does not block the rest of the distribution, but it should be corrected before tomorrow morning.',
      'Recommended action: update the distribution alias or remove the bounced address, then requeue the digest send for the affected group.'
    ],
    kind: InboxItemKind.Digest,
    source: 'Reporting',
    owner: 'Operations',
    context: 'Nightly digest delivery',
    receivedAt: '1h ago',
    href: '/statistics',
    actionLabel: 'Requeue digest',
    priority: InboxPriority.Medium,
    unread: true
  },
  {
    id: 'tenant-owner-invite-expiring',
    title: 'Tenant owner invitation expires soon',
    preview: 'An onboarding invite will expire in less than 24 hours.',
    body: [
      'The primary tenant owner invitation for Harbor Systems will expire tomorrow morning unless it is accepted or reissued.',
      'Provisioning is otherwise complete, but access handoff cannot finish until the customer admin signs in and confirms ownership.'
    ],
    kind: InboxItemKind.Notification,
    source: 'Invitations',
    owner: 'Onboarding',
    context: 'Harbor Systems',
    receivedAt: '2h ago',
    href: '/profile',
    actionLabel: 'Open invite context',
    priority: InboxPriority.Medium
  },
  {
    id: 'incident-timeline-summary',
    title: 'Incident timeline summary generated',
    preview: 'Post-incident notes are ready for operator review.',
    body: [
      'The system generated a timeline summary for the morning notification incident, including retry spikes, mitigation timestamps, and the final recovery event.',
      'This summary is intended for internal review before it is shared with stakeholders.'
    ],
    kind: InboxItemKind.Digest,
    source: 'Incident reporting',
    owner: 'Reliability',
    context: 'Notification incident',
    receivedAt: '2h ago',
    href: '/health',
    actionLabel: 'Open timeline',
    priority: InboxPriority.Low
  },
  {
    id: 'tenant-config-review',
    title: 'Automation posture review requested',
    preview: 'A tenant-level automation override is waiting on approval.',
    body: [
      'A tenant admin requested a broader automation rule for low-risk approvals. The override would reduce manual review load, but it changes the current default control posture.',
      'The policy owner attached projected volume savings, exception thresholds, and rollback guidance if the change is approved.',
      'Recommended action: review the requested automation band, compare it to current settings, and decide whether it should remain tenant-specific or become a shared default.'
    ],
    kind: InboxItemKind.Approval,
    source: 'Settings review',
    owner: 'Platform',
    context: 'Tenant automation policy',
    receivedAt: '3h ago',
    href: '/settings',
    actionLabel: 'Review settings',
    priority: InboxPriority.Medium
  },
  {
    id: 'service-degradation-watch',
    title: 'Digest generation latency is trending upward',
    preview: 'Reporting is still healthy, but generation time is above baseline.',
    body: [
      'Digest generation remains within the healthy band, but processing time has drifted upward for three consecutive runs. The increase is not yet severe enough to create delivery failures, but it merits observation.',
      'Most of the extra latency appears in tenant summary aggregation rather than transport or formatting.',
      'Recommended action: compare the last three successful runs, inspect the reporting workload, and decide whether the threshold should remain informational or be promoted to an operator alert.'
    ],
    kind: InboxItemKind.Alert,
    source: 'Service monitoring',
    owner: 'Reporting',
    context: 'Digest generation',
    receivedAt: '4h ago',
    href: '/health',
    actionLabel: 'Inspect service',
    priority: InboxPriority.Low
  }
];

const inboxCategories: InboxCategory[] = [
  { value: InboxCategoryKey.All, label: 'All inbox' },
  { value: InboxCategoryKey.Approvals, label: 'Approvals' },
  { value: InboxCategoryKey.Alerts, label: 'Alerts' },
  { value: InboxCategoryKey.Notifications, label: 'Notifications' },
  { value: InboxCategoryKey.Digests, label: 'Digests' }
];

function buildInboxGroups(): Record<InboxCategoryKey, InboxItem[]> {
  return {
    [InboxCategoryKey.All]: allInboxItems,
    [InboxCategoryKey.Approvals]: allInboxItems.filter(
      (item) => item.kind === InboxItemKind.Approval
    ),
    [InboxCategoryKey.Alerts]: allInboxItems.filter((item) => item.kind === InboxItemKind.Alert),
    [InboxCategoryKey.Notifications]: allInboxItems.filter(
      (item) => item.kind === InboxItemKind.Notification
    ),
    [InboxCategoryKey.Digests]: allInboxItems.filter((item) => item.kind === InboxItemKind.Digest)
  };
}

function buildInitialSelection(
  groups: Record<InboxCategoryKey, InboxItem[]>
): Record<InboxCategoryKey, string> {
  return {
    [InboxCategoryKey.All]: groups[InboxCategoryKey.All][0]?.id ?? '',
    [InboxCategoryKey.Approvals]: groups[InboxCategoryKey.Approvals][0]?.id ?? '',
    [InboxCategoryKey.Alerts]: groups[InboxCategoryKey.Alerts][0]?.id ?? '',
    [InboxCategoryKey.Notifications]: groups[InboxCategoryKey.Notifications][0]?.id ?? '',
    [InboxCategoryKey.Digests]: groups[InboxCategoryKey.Digests][0]?.id ?? ''
  };
}

function getPriorityTone(priority: InboxPriority) {
  switch (priority) {
    case InboxPriority.High:
      return 'border-[hsl(var(--destructive)/0.24)] bg-[hsl(var(--destructive)/0.06)] text-foreground';
    case InboxPriority.Medium:
      return 'border-[hsl(var(--chart-4)/0.24)] bg-[hsl(var(--chart-4)/0.1)] text-foreground';
    case InboxPriority.Low:
    default:
      return 'border-border/70 bg-[hsl(var(--panel-subtle))] text-foreground';
  }
}

export {
  InboxCategoryKey,
  InboxItemKind,
  InboxPriority,
  allInboxItems,
  buildInboxGroups,
  buildInitialSelection,
  getPriorityTone,
  inboxCategories
};

export type { InboxCategory, InboxItem };
