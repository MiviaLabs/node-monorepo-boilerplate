import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ForgotPasswordPage from './page';

describe('ForgotPasswordPage', () => {
  it('renders the password recovery heading', () => {
    const html = renderToStaticMarkup(<ForgotPasswordPage />);

    expect(html).toContain('Request Password Reset');
    expect(html).toContain('Submit your authorized work email');
    expect(html).toContain('Return to gateway');
    expect(html).toContain('Administrative identity checkpoint');
  });
});
