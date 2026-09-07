import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 bg-background" />
      <div className="relative z-50">{children}</div>
    </div>
  );
}
