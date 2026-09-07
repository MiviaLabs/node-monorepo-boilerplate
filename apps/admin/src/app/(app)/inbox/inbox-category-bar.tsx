'use client';

import { Search } from 'lucide-react';
import React from 'react';

import type { InboxCategory, InboxCategoryKey, InboxItem } from './inbox-data';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { TabsList, TabsTrigger } from '~/components/ui/tabs';

export function InboxCategoryBar({
  categories,
  groups
}: {
  categories: InboxCategory[];
  groups: Record<InboxCategoryKey, InboxItem[]>;
}) {
  return (
    <div className="border-b border-border/70 bg-[hsl(var(--panel))] px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-5 xl:max-w-[860px]">
          {categories.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="min-w-0 justify-between gap-3"
            >
              <span className="truncate">{item.label}</span>
              <span className="rounded-md border border-border/70 bg-[hsl(var(--panel))] px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {groups[item.value].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center xl:max-w-[340px] xl:justify-end">
          <div className="relative w-full xl:max-w-[340px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search inbox"
              placeholder="Search messages, issues, or tasks"
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 self-start sm:self-auto">
            Filter
          </Button>
        </div>
      </div>
    </div>
  );
}
