---
name: admin-inventory-pages
description: Build admin inventory pages with scoped filters, typed data, safe row actions, and existing admin-shell patterns.
---

# Admin inventory pages

## Scope

Applies to list and detail pages for admin users, tenants, memberships,
outbox, inbox, and deletion queues.

## When to use

Use when adding or changing inventory tables, filters, overview loaders, row
actions, or detail navigation in `apps/admin`.

## Inspect first

- `apps/admin/src/lib/admin/api.ts`
- `apps/admin/src/app/(app)/users/page.tsx`
- `apps/admin/src/app/(app)/tenants/page.tsx`
- `apps/admin/src/app/(app)/system/outbox/page.tsx`
- `apps/admin/src/components/admin/`

## Required behavior

- Reuse shared API wrappers and typed response envelopes.
- Keep serializable filters route-driven when the page pattern supports it.
- Extend the existing admin shell and page structure before adding conventions.
- Preserve operator auth headers and tenant context for reads and row actions.

## Verification

- Verify loading, empty, error, filtered, detail, and action states.
- Confirm every request is scoped to the authenticated operator and selected tenant.
- Reuse existing components before introducing a duplicate table or envelope.

## Exclusions

Do not create an alternate admin shell, parse response shapes ad hoc, or make
row actions without the established authorization context.
