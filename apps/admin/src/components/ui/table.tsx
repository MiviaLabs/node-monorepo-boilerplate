'use client';

/**
 * Table Components
 *
 * Reusable table components built on Radix UI
 */

import * as React from 'react';

import { cn } from '~/lib/utils';

type TableDensity = 'default' | 'compact';

/**
 * Table Component
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { density?: TableDensity }
>(({ className, density = 'default', ...props }, ref) => (
  <div className="relative w-full overflow-auto rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--panel))]">
    <table
      ref={ref}
      data-density={density}
      className={cn(
        'w-full caption-bottom text-sm',
        density === 'compact' &&
          'text-[13px] [&_th]:h-9 [&_th]:px-3 [&_th]:text-[10px] [&_th]:tracking-[0.14em] [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-[13px]',
        className
      )}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

/**
 * TableHeader Component
 */
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }
>(({ className, sticky = false, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'bg-[hsl(var(--panel-subtle))] [&_tr]:border-b [&_tr]:border-[hsl(var(--border-subtle))]',
      sticky && 'sticky top-0 z-10',
      className
    )}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

/**
 * TableBody Component
 */
const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

/**
 * TableFooter Component
 */
const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--panel-subtle))] font-medium last:[&>tr]:border-b-0',
      className
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

/**
 * TableRow Component
 */
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-[hsl(var(--border-subtle))] transition-colors duration-150 hover:bg-[hsl(var(--panel-subtle))] data-[state=selected]:bg-[hsl(var(--control))]',
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = 'TableRow';

/**
 * TableHead Component
 */
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-11 px-3.5 text-left align-middle text-[11px] font-medium uppercase tracking-[0.12em] text-tertiary has-[[role=checkbox]]:pr-0 *:[[role=checkbox]]:translate-y-[2px]',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

/**
 * TableCell Component
 */
const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-3.5 py-3 align-middle text-sm has-[[role=checkbox]]:pr-0 *:[[role=checkbox]]:translate-y-[2px]',
      className
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

/**
 * TableCaption Component
 */
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
));
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
