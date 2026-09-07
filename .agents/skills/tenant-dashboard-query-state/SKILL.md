---
name: tenant-dashboard-query-state
description: Keep tenant dashboard query state URL-driven, server-first, optimistic where safe, and bounded in read cost.
---

# Tenant dashboard query state

## Scope

Applies to `apps/web` members and projects dashboards, their filters, tables,
optimistic mutations, and page-level data loading.

## When to use

Use when changing URL filters, sorting, pagination, server reads, optimistic
updates, or protected dashboard rendering.

## Inspect first

- `apps/web/src/lib/members/members-query-params.ts`
- `apps/web/src/lib/projects/projects-query-params.ts`
- `apps/web/src/lib/members/optimistic-updates.ts`
- `apps/web/src/components/members/`
- `apps/web/src/components/projects/`

## Required behavior

- Keep filters and sorting URL-addressable when the page pattern supports it.
- Prefer server-first loading and shared query-parameter utilities.
- Derive display state during render; use `useEffect` only to synchronize an external system.
- Put saves, mutations, and resets in explicit event or command paths.
- Reuse optimistic update helpers and preserve tenant/auth context.
- Keep route fetch fan-out bounded with page-shaped reads.

## Verification

- Check first paint, URL restoration, mutation rollback, tenant routing, and loading/error states.
- Document the external system for every new Effect.
- Confirm bounded reads for slices, relation candidates, and overview counts.

## Exclusions

Do not mirror server/URL state into local state for convenience, reorder
protected content client-side after first paint, or fall back to full-list reads.
