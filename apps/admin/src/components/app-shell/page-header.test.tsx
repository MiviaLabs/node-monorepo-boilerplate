import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button } from '~/components/ui/button';
import { SidebarProvider } from '~/components/ui/sidebar';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders actions in the mobile action row and desktop action row', () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <PageHeader title="Dashboard" actions={<Button size="sm">Create report</Button>} />
      </SidebarProvider>
    );

    expect(html).toContain('Create report');
    expect(html).toContain('mt-4 flex flex-wrap gap-2 md:hidden');
    expect(html).toContain('hidden items-center gap-2 md:flex');
    expect(html).toContain('h-10 w-10');
  });
});
