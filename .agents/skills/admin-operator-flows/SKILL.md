---
name: admin-operator-flows
description: Secure the complete admin operator session, route, API-bridge, and failure-recovery lifecycle.
---

# Admin operator and session flows

## Scope

Applies to `apps/admin` authentication, operator sessions, cookies,
protected layouts, token refresh, logout, API header bridging, and admin-facing
protected routes. The former session-operations skill was merged here.

## When to use

Activate when a change can alter operator identity, session validity, route
gating, refresh behavior, or auth-failure cleanup.

## Inspect first

- `apps/admin/src/lib/auth/server-session.ts`
- `apps/admin/src/lib/admin-auth.ts`
- `apps/admin/src/app/(app)/layout.tsx`
- `apps/admin/src/app/api/auth/login/route.ts`
- `apps/admin/src/middleware.test.ts`
- `apps/admin/src/lib/admin/api.ts`

## Blocking requirements

## Required behavior

- Resolve operator sessions through shared session helpers.
- Preserve refresh, retry, logout, and auth-failure cleanup semantics.
- Reuse existing route-handler and layout guards.
- Keep access-token, cookies, and `x-tenant-id` propagation aligned.
- Keep API access behind `apiFetch` and typed admin wrappers.
- Never let an auth failure become anonymous or broad-scope access.

## Verification

- Test login, protected access, expiry/refresh, logout, failed-auth cleanup,
  and header propagation.
- Use real full-stack validation for auth-sensitive protected flows and record
  the exact command and residual risk.

## Exclusions

Do not create a second auth boundary, bypass a protected layout, parse API
envelopes independently, detach operator identity from tenant context, or
silently turn an auth failure into an anonymous or broad-access state.
