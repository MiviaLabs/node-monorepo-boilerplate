'use client';

import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import {
  IconBook2,
  IconBuildingSkyscraper,
  IconLayoutDashboard,
  IconLock,
  IconLogout,
  IconPlayerPlay,
  IconShieldCheck,
  IconUserPlus
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

import BorderBeam from '~/components/magicui/BorderBeam';
import DotPattern from '~/components/magicui/DotPattern';
import Marquee from '~/components/magicui/Marquee';
import { useAuth } from '~/hooks/use-auth';

const capabilities = [
  {
    title: 'Authentication',
    description: 'Email/password flows, protected routes, and session lifecycle.',
    icon: IconLock
  },
  {
    title: 'Tenant Isolation',
    description: 'Organization-aware access boundaries by default.',
    icon: IconBuildingSkyscraper
  },
  {
    title: 'RBAC',
    description: 'Role and permission checks designed for multi-tenant systems.',
    icon: IconShieldCheck
  },
  {
    title: 'Typed API',
    description: 'Type-safe contracts between web and API for safer iteration.',
    icon: IconBook2
  }
] as const;

export function HomepageFlexy({ apiDocsUrl }: { apiDocsUrl: string }) {
  const router = useRouter();
  const { user, isAuthenticated, logout, isLoading } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <Stack spacing={3}>
        <Card variant="outlined">
          <CardContent className="relative overflow-hidden" sx={{ p: { xs: 3, md: 4 } }}>
            <DotPattern
              className="mask-[radial-gradient(360px_circle_at_center,white,transparent)]"
              width={20}
              height={20}
              cx={1}
              cy={1}
              cr={1}
            />
            <BorderBeam size={260} duration={12} delay={8} />
            <Stack spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
              <Chip label="Enterprise Starter" size="small" sx={{ width: 'fit-content' }} />
              <Typography variant="h3" fontWeight={700}>
                Build tenant-aware products on a reliable baseline
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Real authentication, tenant isolation, RBAC, and typed API contracts are ready from
                day one.
              </Typography>
              <Marquee pauseOnHover className="[--duration:20s]">
                <Chip label="PDPL Ready" variant="outlined" />
                <Chip label="GDPR Aligned" variant="outlined" />
                <Chip label="SOC 2 Friendly" variant="outlined" />
                <Chip label="Saudi Arabia" variant="outlined" />
                <Chip label="European Union" variant="outlined" />
                <Chip label="United States" variant="outlined" />
              </Marquee>
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Quick actions</Typography>
                <Stack direction="row" gap={1.5} flexWrap="wrap">
                  {isAuthenticated && user ? (
                    <>
                      <Button
                        variant="contained"
                        startIcon={<IconLayoutDashboard size={18} />}
                        onClick={() => router.push('/dashboard')}
                      >
                        Go to Dashboard
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<IconLogout size={18} />}
                        onClick={handleLogout}
                        disabled={isLoading}
                      >
                        Logout
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="contained" onClick={() => router.push('/login')}>
                        Login
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<IconUserPlus size={18} />}
                        onClick={() => router.push('/register')}
                      >
                        Register
                      </Button>
                    </>
                  )}
                  <Button
                    variant="text"
                    startIcon={<IconBook2 size={18} />}
                    component="a"
                    href={apiDocsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open API Docs
                  </Button>
                </Stack>
                {isAuthenticated && user ? (
                  <Typography variant="body2" color="text.secondary">
                    Signed in as {user.email}
                  </Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconPlayerPlay size={18} />
                  Full stack verification
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Browser to Web to API to containerized dependencies.
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    overflowX: 'auto',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'action.hover',
                    fontSize: 12
                  }}
                >
                  {`pnpm --dir apps/api test:e2e:setup
pnpm exec playwright test --config apps/web-e2e/playwright.config.ts
pnpm --dir apps/api test:e2e:teardown`}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {capabilities.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} variant="outlined">
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={1}>
                    <Typography
                      variant="subtitle1"
                      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                    >
                      <Icon size={18} />
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.description}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </Stack>
    </Container>
  );
}
