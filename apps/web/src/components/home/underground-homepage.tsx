'use client';

import {
  BookMarked,
  Building2,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  enterpriseOutlineButtonClass,
  enterprisePrimaryButtonClass
} from '~/components/ui/enterprise-styles';
import { useAuth } from '~/hooks/use-auth';

const heroPills = [
  'Zero-trust tenancy',
  'Fine-grained RBAC',
  'Strict API contracts',
  'End-to-end verified'
] as const;

const proofStats = [
  { label: 'Isolated by design', value: 'Complete organizational boundaries across every layer' },
  { label: 'Production ready', value: 'Integrated OpenAPI specs, robust auth, and test suites' },
  {
    label: 'Accelerated velocity',
    value: 'Bypass infrastructure hurdles and launch product faster'
  }
] as const;

const platformCards = [
  {
    title: 'Authentication & Identity',
    description:
      'Enterprise credentials, secure invitation gates, protected route guards, and resilient sessions.',
    icon: KeyRound
  },
  {
    title: 'Organizational Tenancy',
    description:
      'Context-isolated request pipelines with strict scoping for workspaces and team memberships.',
    icon: Building2
  },
  {
    title: 'Governance & Permissions',
    description: 'Policy-based role enforcement via edge middleware with transparent auditability.',
    icon: ShieldCheck
  }
] as const;

const operatingModel = [
  'Ship with real authentication workflows and guarded data boundaries from day one.',
  'Access live, interactive API documentation directly from the main gateway.',
  'Validate client interfaces, service APIs, and isolated datastores continuously.'
] as const;

const architectureRail = [
  {
    label: 'Security',
    value: 'Stateful sessions, key recovery, credential onboarding',
    icon: KeyRound
  },
  {
    label: 'Permissions',
    value: 'Role checks and organization context middleware',
    icon: ShieldCheck
  },
  {
    label: 'Foundation',
    value: 'Next.js App Router, NestJS core, and end-to-end typing',
    icon: Building2
  },
  {
    label: 'Reliability',
    value: 'Automated Playwright specs, integration tests, container test beds',
    icon: Gauge
  }
] as const;

const commandSteps = [
  'pnpm --dir apps/api test:e2e:setup',
  'pnpm exec playwright test --config apps/web-e2e/playwright.config.ts',
  'pnpm --dir apps/api test:e2e:teardown'
] as const;

function AuthCtas({ apiDocsUrl }: { apiDocsUrl: string }) {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="space-y-4">
      {isAuthenticated && user ? (
        <div className="flex flex-wrap gap-3">
          <Button asChild className={`h-10 ${enterprisePrimaryButtonClass}`}>
            <Link href="/dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Go to dashboard
            </Link>
          </Button>
          <Button
            variant="outline"
            className={`h-10 ${enterpriseOutlineButtonClass}`}
            onClick={() => void logout()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button asChild className={`h-10 ${enterprisePrimaryButtonClass}`}>
            <Link href="/register">
              <UserPlus className="mr-2 h-4 w-4" />
              Create workspace
            </Link>
          </Button>
          <Button variant="outline" asChild className={`h-10 ${enterpriseOutlineButtonClass}`}>
            <Link href="/login">
              <LogIn className="mr-2 h-4 w-4" />
              Log in
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={apiDocsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <BookMarked className="h-3.5 w-3.5" />
          Explore API reference
        </a>
        {isAuthenticated && user ? (
          <span className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Unified foundation linking public discovery to enterprise control planes.
          </span>
        )}
      </div>
    </div>
  );
}

export function UndergroundHomepage() {
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const apiUrl = rawApiUrl.replace(/\/+$/, '');
  const apiDocsUrl = apiUrl
    ? `${apiUrl}${apiUrl.endsWith('/api') ? '/docs' : '/api/docs'}`
    : '/api/docs';

  return (
    <main className="relative">
      <section className="container py-8 md:py-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px]">
          <div className="premium-feature-panel rounded-[28px] border p-6 md:p-8 lg:p-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Enterprise SaaS Foundation
              </span>
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Unified operational control plane
              </span>
            </div>

            <div className="mt-6 max-w-3xl space-y-5">
              <h1 className="text-balance text-[2.65rem] font-semibold leading-[0.94] tracking-[-0.045em] text-foreground sm:text-[3.4rem]">
                Purpose-built operational interface for multi-tenant teams.
              </h1>
              <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
                Engineered with precision: high-density typography, refined blue-gray palettes,
                structural border depth, and deterministic workflows built for real-world
                operations.
              </p>
              <div className="flex flex-wrap gap-2.5">
                {heroPills.map((item) => (
                  <span
                    key={item}
                    className="rounded-md border border-border/70 bg-[hsl(var(--panel))] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/78"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <AuthCtas apiDocsUrl={apiDocsUrl} />
            </div>

            <div className="mt-8 grid gap-4 border-t border-border/70 pt-6 md:grid-cols-3">
              {proofStats.map((item) => (
                <div key={item.label} className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="text-sm leading-6 text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="premium-panel border-border/70">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle>System architecture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <div className="space-y-3">
                {architectureRail.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel))] text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            {item.label}
                          </p>
                          <p className="text-sm text-foreground">{item.value}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Verification pipeline
                </p>
                <div className="mt-3 space-y-2">
                  {commandSteps.map((command) => (
                    <div
                      key={command}
                      className="rounded-md border border-border/70 bg-[hsl(var(--panel))] px-3 py-2 font-mono text-[12px] text-foreground"
                    >
                      {command}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="container pb-10 md:pb-16">
        <div className="grid gap-4 lg:grid-cols-3">
          {platformCards.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="premium-panel border-border/70">
                <CardHeader className="pb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="pt-3">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="premium-panel border-border/70">
            <CardHeader className="pb-3">
              <CardTitle>Core architecture principles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {operatingModel.map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-3 text-sm leading-6 text-foreground"
                >
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="premium-panel border-border/70">
            <CardHeader className="pb-3">
              <CardTitle>Operational standards</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {proofStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3"
                >
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
