'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  BookMarked,
  Building2,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  PlayCircle,
  ShieldCheck,
  UserPlus,
  Users
} from 'lucide-react';
import Link from 'next/link';

import { CommandSnippet, HomeSection, HomeSurface } from './home-primitives';
import { BentoCard, BentoGrid } from '../magicui/BentoGrid';

import { Button } from '~/components/ui/button';
import {
  enterpriseOutlineButtonClass,
  enterprisePrimaryButtonClass
} from '~/components/ui/enterprise-styles';
import { useAuth } from '~/hooks/use-auth';
import { standardTransition } from '~/lib/motion';

const capabilities = [
  {
    name: 'Authentication',
    description: 'Email/password flows, session lifecycle, and protected routes.',
    Icon: KeyRound,
    href: '/login',
    cta: 'Learn more',
    background: <div className="absolute -right-20 -top-20 opacity-60" />,
    className: 'lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3'
  },
  {
    name: 'Tenant Isolation',
    description: 'Organization-aware request handling and membership boundaries.',
    Icon: Building2,
    href: '#',
    cta: 'Learn more',
    background: <div className="absolute -right-20 -top-20 opacity-60" />,
    className: 'lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-2'
  },
  {
    name: 'RBAC',
    description: 'Role and permission checks designed for multi-tenant access control.',
    Icon: ShieldCheck,
    href: '#',
    cta: 'Learn more',
    background: <div className="absolute -right-20 -top-20 opacity-60" />,
    className: 'lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2'
  },
  {
    name: 'Typed API',
    description: 'Type-safe contracts across web and API layers for faster iteration.',
    Icon: BookMarked,
    href: '#',
    cta: 'Learn more',
    background: <div className="absolute -right-20 -top-20 opacity-60" />,
    className: 'lg:col-start-2 lg:col-end-3 lg:row-start-2 lg:row-end-3'
  },
  {
    name: 'End-to-End Testing',
    description: 'Playwright + real API + Testcontainers flow for critical journeys.',
    Icon: Users,
    href: '#',
    cta: 'Learn more',
    background: <div className="absolute -right-20 -top-20 opacity-60" />,
    className: 'lg:col-start-3 lg:col-end-4 lg:row-start-2 lg:row-end-3'
  }
] as const;

interface AuthAwareContentProps {
  apiDocsUrl: string;
}

export function HomeQuickActions({ apiDocsUrl }: AuthAwareContentProps) {
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };
  const authSwapVariants = {
    initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -6, filter: 'blur(4px)' }
  } as const;

  return (
    <HomeSurface className="h-full p-5">
      <HomeSection
        title="Quick actions"
        description="Use common entry points for onboarding, diagnostics, and local verification."
        compact
      >
        <div className="flex flex-wrap gap-3">
          <AnimatePresence mode="wait" initial={false}>
            {isAuthenticated && user ? (
              <motion.div
                key="quick-actions-authed"
                variants={authSwapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={standardTransition}
                className="flex flex-wrap gap-3"
              >
                <Button asChild className={`h-10 ${enterprisePrimaryButtonClass}`}>
                  <Link href="/dashboard">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Go to Dashboard
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className={`h-10 ${enterpriseOutlineButtonClass}`}
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="quick-actions-guest"
                variants={authSwapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={standardTransition}
                className="flex flex-wrap gap-3"
              >
                <Button asChild className={`h-10 ${enterprisePrimaryButtonClass}`}>
                  <Link href="/login">
                    <LogIn className="mr-2 h-4 w-4" />
                    Login
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className={`h-10 ${enterpriseOutlineButtonClass}`}
                  asChild
                >
                  <Link href="/register">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Register
                  </Link>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            asChild
            variant="secondary"
            className="h-10 border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            <a href={apiDocsUrl} target="_blank" rel="noopener noreferrer">
              <BookMarked className="mr-2 h-4 w-4" />
              Open API Docs
            </a>
          </Button>
        </div>
        <AnimatePresence initial={false}>
          {isAuthenticated && user ? (
            <motion.p
              key="signed-in-copy"
              variants={authSwapVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={standardTransition}
              className="text-xs text-muted-foreground"
            >
              Signed in as <span className="font-medium text-foreground">{user.email}</span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </HomeSection>
    </HomeSurface>
  );
}

export function AuthAwareContent() {
  return (
    <div className="space-y-8 pb-8 md:space-y-10">
      <div className="grid gap-5 lg:grid-cols-4">
        <HomeSection title="What's included" compact className="lg:col-span-3">
          <BentoGrid className="lg:grid-rows-2">
            {capabilities.map((capability) => {
              return <BentoCard key={capability.name} {...capability} />;
            })}
          </BentoGrid>
          <p className="text-xs text-muted-foreground/90">
            Typical outcome: reduce initial feature-delivery setup time for new ventures by about 3
            months.
          </p>
        </HomeSection>

        <HomeSection title="Run E2E" compact className="lg:col-span-1">
          <HomeSurface className="p-4 md:p-5">
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground md:text-base">
                <PlayCircle className="h-4 w-4 text-primary" />
                Full stack verification
              </h3>
              <p className="text-xs text-muted-foreground md:text-sm">
                Full-stack verification path: Browser to Web to API to containerized dependencies.
              </p>
              <CommandSnippet>{`pnpm --dir apps/api test:e2e:setup
pnpm exec playwright test --config apps/web-e2e/playwright.config.ts
pnpm --dir apps/api test:e2e:teardown`}</CommandSnippet>
            </div>
          </HomeSurface>
        </HomeSection>
      </div>
    </div>
  );
}
