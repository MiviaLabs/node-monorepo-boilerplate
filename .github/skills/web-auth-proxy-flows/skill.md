---
name: web-auth-proxy-flows
description: Secure the complete Next.js authentication and proxy lifecycle from browser route to API boundary.
---

# Web authentication and proxy flows

## Scope

Applies to `apps/web` auth helpers, middleware, proxy routes, invitations,
protected dashboards, cookies, headers, and trace continuity. This skill owns
the full flow; the former route-only skill was merged here.

## When to use

Activate when a change can affect login, logout, reset, invitation, session,
route access, proxy transport, or protected-page loading.

## What to inspect first

- `apps/web/src/lib/api/auth-api.ts`
- `apps/web/src/lib/auth/server-auth.ts`
- `apps/web/src/lib/auth/get-user-session.ts`
- `apps/web/src/lib/diagnostics/phase-zero-diagnostics.ts`
- `apps/web/src/proxy.ts`
- `apps/web/src/components/dashboard/route-access.ts`
- `apps/web/src/components/auth/`

## Blocking requirements

- Keep browser auth calls behind the established `/api/...` proxy.
- Preserve cookies, auth headers, tenant context, redirects, and one trace
  chain across middleware, SSR, proxy, and API hops.
- Do not add duplicate validation or bootstrap work to the protected healthy
  path without recording the current and target request budget.
- Classify every protected read as critical or optional; optional reads must
  not delay the shell unless a measured requirement says otherwise.
- Never cache auth decisions, session state, signed URLs, or sensitive payloads
  without an explicit invalidation and stale-read strategy.
- Require real browser/API E2E for protected-flow changes.

## Review procedure

- Identify whether the boundary is UI, middleware, proxy route, or shared auth helper.
- Make degraded auth/data paths explicit, observable, and authorization-safe.
- Check high-cardinality identifiers are absent from metric labels.
- Verify affected invitation, login, logout, reset, or dashboard paths end to end.

## Verification

- Use existing auth error normalization and route-access helpers.
- Recheck tenant/session checks, redirect semantics, and trace continuity.
- Record the E2E command, covered flow, and residual risk in task evidence.

## Exclusions

Do not call backend services directly from browser code where a proxy exists,
weaken middleware checks, retry broadly, silently fall back, broaden tenant
scope, or cache unstable auth/session/signed-URL values.
