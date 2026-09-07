import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import React, { useEffect } from 'react';
import rtlPlugin from 'stylis-plugin-rtl';

const styleCache = () =>
  createCache({
    key: 'rtl',
    prepend: true,
    // @see https://github.com/styled-components/stylis-plugin-rtl/issues/23
    stylisPlugins: [rtlPlugin]
  });

export default function RTL({
  children,
  direction
}: {
  children: React.ReactNode;
  direction: string;
}) {
  useEffect(() => {
    document.dir = direction;
  }, [direction]);

  if (direction === 'rtl') {
    return <CacheProvider value={styleCache()}>{children}</CacheProvider>;
  }

  return <>{children}</>;
}
