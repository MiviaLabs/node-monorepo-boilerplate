import './global.css';
import localFont from 'next/font/local';
import { headers } from 'next/headers';

import { Providers } from '~/components/providers';

const ibmPlexSans = localFont({
  src: [
    {
      path: './fonts/ibm-plex-sans-latin.woff2',
      weight: '400',
      style: 'normal'
    },
    {
      path: './fonts/ibm-plex-sans-latin.woff2',
      weight: '500',
      style: 'normal'
    },
    {
      path: './fonts/ibm-plex-sans-latin.woff2',
      weight: '600',
      style: 'normal'
    },
    {
      path: './fonts/ibm-plex-sans-latin.woff2',
      weight: '700',
      style: 'normal'
    }
  ],
  variable: '--font-sans',
  display: 'swap'
});

export const metadata = {
  title: 'CoreOps Platform | Multi-Tenant Workspace',
  description:
    'Production-ready full-stack workspace suite powered by Next.js, tRPC, and enterprise tenant controls.'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Force dynamic rendering at request time (not build time)
  // This ensures process.env.API_URL is read at runtime
  await headers();

  // CRITICAL: Do NOT inject API_URL into HTML for client-side use
  // Client-side (browser) should ALWAYS use relative URLs (/api/trpc)
  // Server-side (Next.js API routes) will use API_URL from environment
  // Empty string here forces client to use relative URLs -> Next.js API routes -> Backend
  const apiUrl = '';

  // TODO: Implement proper CSRF token generation
  // CSRF tokens should be generated server-side (e.g., via a dedicated route that sets a cookie)
  // rather than reading from request headers. Remove broken implementation for now.

  return (
    <html lang="en" suppressHydrationWarning data-api-url={apiUrl || undefined}>
      <head></head>
      <body className={ibmPlexSans.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
