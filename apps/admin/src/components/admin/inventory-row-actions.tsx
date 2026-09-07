'use client';

import { ExternalLink, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';

export function InventoryRowActions({
  label = 'Row actions',
  children
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="tableIcon"
          className="text-muted-foreground hover:text-foreground"
          aria-label={label}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InventoryRowActionsLabel({ children }: { children: React.ReactNode }) {
  return <DropdownMenuLabel>{children}</DropdownMenuLabel>;
}

export function InventoryRowActionsSeparator() {
  return <DropdownMenuSeparator />;
}

export function InventoryRowActionLink({
  href,
  children
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href}>
        <ExternalLink className="h-4 w-4" />
        {children}
      </Link>
    </DropdownMenuItem>
  );
}
