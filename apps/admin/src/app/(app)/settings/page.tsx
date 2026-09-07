import React from 'react';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';

const platformSettings = [
  {
    title: 'Account access',
    description: 'Current platform defaults for registration and new-account verification.',
    items: [
      { label: 'Allow registration', value: 'Enabled' },
      { label: 'Require email verification', value: 'Required' },
      { label: 'Default user role', value: 'tenant_user' }
    ]
  },
  {
    title: 'Tenant and session limits',
    description:
      'Persisted capacity and session policies exposed by the current system settings DTO.',
    items: [
      { label: 'Max tenants per user', value: '1 tenant' },
      { label: 'Session timeout', value: '3600 seconds' }
    ]
  },
  {
    title: 'Password policy',
    description: 'Baseline password requirements represented by the current persisted contract.',
    items: [
      { label: 'Minimum length', value: '8 characters' },
      { label: 'Uppercase letters', value: 'Required' },
      { label: 'Lowercase letters', value: 'Required' },
      { label: 'Numbers', value: 'Required' },
      { label: 'Special characters', value: 'Optional' }
    ]
  }
] as const;

const followUpItems = [
  'Alert routing and escalation rules',
  'Digest cadence and notification recipients',
  'Automation posture and approval thresholds',
  'Maintenance windows or operational scheduling'
] as const;

export default function SettingsPage() {
  return (
    <AppPage className="space-y-6">
      <PageHeader
        title="Settings"
        badge="System"
        description="This route currently reflects the persisted platform settings contract only. Broader operational policy controls stay out of scope until backend modeling is defined."
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4">
          {platformSettings.map((group) => (
            <Card key={group.title} className="premium-panel rounded-lg border-border/70">
              <CardHeader className="border-b border-border/70 pb-4">
                <Badge
                  variant="secondary"
                  className="w-fit rounded-md px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]"
                >
                  Platform contract
                </Badge>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3"
                  >
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4">
          <Card className="premium-panel rounded-lg border-border/70">
            <CardHeader className="border-b border-border/70 pb-4">
              <Badge
                variant="secondary"
                className="w-fit rounded-md px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]"
              >
                Read-only
              </Badge>
              <CardTitle>Contract status</CardTitle>
              <CardDescription>
                The API exposes a limited platform settings DTO today, and the read side is still
                mocked in the backend.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4">
              <div className="rounded-lg border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  Why this page is not editable yet
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  The current backend contract covers basic platform settings only. Editing stays
                  disabled here until the system settings read path and ownership model are fully
                  reconciled.
                </p>
              </div>

              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Follow-up backend modeling
                </p>
                <ul className="mt-2 space-y-2 text-sm text-foreground">
                  {followUpItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppPage>
  );
}
