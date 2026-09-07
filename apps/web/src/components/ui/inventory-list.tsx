import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { ReactNode } from 'react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { cn } from '~/lib/utils';

interface InventoryListHeaderCell {
  key: string;
  content: ReactNode;
  className?: string;
}

interface InventoryListShellProps {
  title?: string;
  total: number;
  summary?: ReactNode;
  toolbar?: ReactNode;
  headerActions?: ReactNode;
  filterBar?: ReactNode;
  headerCells: InventoryListHeaderCell[];
  desktopGridClassName: string;
  hasRows: boolean;
  emptyState?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function InventoryListShell({
  title,
  total,
  summary,
  toolbar,
  headerActions,
  filterBar,
  headerCells,
  desktopGridClassName,
  hasRows,
  emptyState,
  footer,
  children,
  className,
  bodyClassName
}: InventoryListShellProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <Card className={cn(enterpriseCardVariants(), 'overflow-hidden')}>
        <CardContent className="p-0">
          <div className="border-b border-border/70 px-4 py-4">
            {summary ? <div>{summary}</div> : null}
            {title ? (
              <div className={cn('flex items-center gap-2.5', summary ? 'mt-3' : '')}>
                <h2 className="text-sm font-bold uppercase tracking-tight text-foreground/90">
                  {title}
                </h2>
                <Badge
                  variant="outline"
                  className="border-border/40 bg-secondary/20 px-1.5 py-0 text-[10px] font-bold text-muted-foreground"
                >
                  {total}
                </Badge>
              </div>
            ) : null}
            {toolbar || headerActions ? (
              <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">{toolbar}</div>
                {headerActions ? (
                  <div className="flex flex-wrap items-center gap-2">{headerActions}</div>
                ) : null}
              </div>
            ) : null}
            {filterBar ? <div className="mt-3">{filterBar}</div> : null}
          </div>

          <div
            className={cn(
              'hidden gap-3 border-b border-border/70 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground md:grid',
              desktopGridClassName
            )}
          >
            {headerCells.map((cell) => (
              <div key={cell.key} className={cell.className}>
                {cell.content}
              </div>
            ))}
          </div>

          <div className={cn('divide-y divide-border/70', bodyClassName)}>
            {hasRows ? children : emptyState}
          </div>
        </CardContent>
      </Card>

      {footer}
    </div>
  );
}

interface InventoryListPaginationProps {
  page: number;
  totalPages: number;
  showingFrom: number;
  showingTo: number;
  total: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function InventoryListPagination({
  page,
  totalPages,
  showingFrom,
  showingTo,
  total,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext
}: InventoryListPaginationProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2">
      <div className="flex items-center gap-2 rounded-full border border-border/40 bg-secondary/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/80">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        </span>
        Showing {showingFrom}-{showingTo} of {total}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 rounded-lg border border-border/40 p-0 transition-[background-color,border-color,opacity] duration-150 hover:border-border hover:bg-card"
          onClick={onPrevious}
          disabled={!canGoPrevious}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous Page</span>
        </Button>
        <div className="flex items-center px-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {page} <span className="mx-1 opacity-40">/</span> {totalPages}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 rounded-lg border border-border/40 p-0 transition-[background-color,border-color,opacity] duration-150 hover:border-border hover:bg-card"
          onClick={onNext}
          disabled={!canGoNext}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next Page</span>
        </Button>
      </div>
    </div>
  );
}
