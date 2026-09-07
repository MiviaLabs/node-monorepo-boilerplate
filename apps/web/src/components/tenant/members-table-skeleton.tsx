/**
 * Members Table Skeleton Component
 *
 * Loading skeleton displayed while members data streams from server
 * Prevents layout shift and provides instant visual feedback
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '~/components/ui/table';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Number of skeleton rows to display during loading */
const SKELETON_ROW_COUNT = 10;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Members Table Skeleton Component
 *
 * Matches the layout of the actual members table to prevent layout shift.
 * Displays while data is streaming from the server.
 *
 * @returns Skeleton UI matching members table structure
 */
export function MembersTableSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-80 max-w-[90vw]" />
        </div>
      </div>

      {/* Stats + Actions */}
      <Card className={`${enterpriseCardVariants()} border-none bg-transparent shadow-none`}>
        <CardHeader className="sr-only">
          <CardTitle>Members</CardTitle>
          <CardDescription>Members loading</CardDescription>
        </CardHeader>
        <CardContent className="px-1 py-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-1.5"
                >
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-12" />
                    <Skeleton className="h-5 w-10" />
                  </div>
                </div>
              ))}
              <div className="ml-2 hidden items-center gap-2 rounded-full border border-border/40 bg-secondary/20 px-3 py-1 lg:flex">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members Directory Header + Filters */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 px-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-8 rounded-sm" />
            </div>
          </div>
          <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <Skeleton className="h-9 w-full max-w-md" />
            </div>
            <div className="flex items-center gap-2.5">
              <Skeleton className="hidden h-8 w-20 md:block" />
              <Skeleton className="h-9 w-[135px]" />
              <Skeleton className="h-9 w-[135px]" />
            </div>
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="overflow-hidden rounded-xl border border-border/40 bg-card/30 shadow-xs">
          <Table className="text-[13px]">
            <TableHeader className="bg-muted/30">
              <TableRow className="border-b border-border/40 hover:bg-transparent">
                <TableHead className="h-10 px-4">
                  <Skeleton className="h-3 w-20" />
                </TableHead>
                <TableHead className="h-10 px-4">
                  <Skeleton className="h-3 w-12" />
                </TableHead>
                <TableHead className="h-10 px-4">
                  <Skeleton className="h-3 w-14" />
                </TableHead>
                <TableHead className="h-10 px-4">
                  <Skeleton className="h-3 w-20" />
                </TableHead>
                <TableHead className="h-10 px-4">
                  <Skeleton className="h-3 w-8" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                <TableRow key={i} className="border-b border-border/30 last:border-0">
                  <TableCell className="px-4 py-2.5">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Skeleton */}
        <div className="flex items-center justify-between gap-2 px-1 py-2">
          <Skeleton className="h-7 w-44 rounded-full" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
