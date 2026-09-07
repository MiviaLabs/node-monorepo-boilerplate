import React from 'react';

import { cn } from '~/lib/utils';

export const enum AppPageWidth {
  Full = 'full',
  Narrow = 'narrow',
  Edge = 'edge'
}

export function AppPage({
  children,
  width = AppPageWidth.Full,
  className
}: {
  children: React.ReactNode;
  width?: AppPageWidth;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-full',
        width === AppPageWidth.Narrow && 'mx-auto max-w-[980px]',
        width === AppPageWidth.Edge && '-mx-4 w-[calc(100%+2rem)] sm:-mx-6 sm:w-[calc(100%+3rem)]',
        className
      )}
    >
      {children}
    </div>
  );
}
