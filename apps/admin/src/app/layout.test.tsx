import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RootLayout from './layout';

vi.mock('next/font/google', () => ({
  IBM_Plex_Sans: () => ({
    className: 'font-ibm-plex-sans',
    variable: 'font-ibm-plex-sans-variable'
  })
}));

vi.mock('~/components/providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

describe('RootLayout', () => {
  const originalApiUrl = process.env.API_URL;
  const originalPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalApiUrl;
    }

    if (originalPublicApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalPublicApiUrl;
    }
  });

  it('renders without requiring an api url at build time', () => {
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    const html = renderToStaticMarkup(
      RootLayout({
        children: <div>Admin shell</div>
      })
    );

    expect(html).toContain('Admin shell');
    expect(html).not.toContain('data-api-url=');
  });

  it('exposes the configured api url when one is available', () => {
    process.env.API_URL = 'https://api.example.test';

    const html = renderToStaticMarkup(
      RootLayout({
        children: <div>Admin shell</div>
      })
    );

    expect(html).toContain('data-api-url="https://api.example.test"');
  });
});
