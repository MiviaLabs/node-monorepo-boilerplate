import React from 'react';

import { DesignSystemShowcase } from '~/components/design-system/design-system-showcase';
import { ThemeToggle } from '~/components/theme-toggle';
import { Badge } from '~/components/ui/badge';

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--canvas))]">
      <div className="container py-8 sm:py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary">Design System</Badge>
            <div className="space-y-2">
              <h1 className="text-[1.9rem] font-semibold tracking-tight text-foreground sm:text-[2.1rem]">
                Admin UI baseline
              </h1>
              <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
                Reference page for the typography, surface, control, overlay, and data presentation
                styles used across the admin.
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <DesignSystemShowcase />
      </div>
    </main>
  );
}
