import './global.css';

import { IBM_Plex_Sans } from 'next/font/google';
import React from 'react';

import { Providers } from '~/components/providers';
import { getRuntimeConfig } from '~/lib/runtime-config';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans'
});

export const metadata = {
  title: 'Operations Console',
  description: 'Administrative control portal built with Next.js, tRPC, and shadcn/ui'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { apiUrl } = getRuntimeConfig();

  return (
    <html lang="en" suppressHydrationWarning data-api-url={apiUrl || undefined}>
      <body className={ibmPlexSans.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
