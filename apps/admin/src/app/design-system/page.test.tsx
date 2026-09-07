import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import DesignSystemPage from './page';

describe('DesignSystemPage', () => {
  it('renders the updated typography guidance and showcase', () => {
    const html = renderToStaticMarkup(<DesignSystemPage />);

    expect(html).toContain('Admin UI baseline');
    expect(html).toContain('IBM Plex Sans baseline');
    expect(html).toContain('Current shell typography in context');
    expect(html).toContain('overflow row actions');
    expect(html).toContain('Typography');
  });
});
