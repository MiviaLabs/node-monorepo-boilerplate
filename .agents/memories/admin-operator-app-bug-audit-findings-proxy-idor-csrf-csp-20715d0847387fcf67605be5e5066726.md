---
id: admin_operator_app_bug_audit_findings_proxy_idor_csrf_csp_20715d0847387fcf67605be5e5066726
title: 'Admin operator app — bug audit findings (proxy, IDOR, CSRF, CSP)'
content: 'apps/admin Next.js operator app — 12 reachable high-impact bugs found in audit (install race, proxy CSRF, IDOR via missing tenant scope, no CSRF on /api/admin/* DELETEs, tRPC accepts arbitrary JSON, no CSP headers, weak password complexity, session-fixation window, etc.).'
importance: medium
x-scope: project
x-verdict: bad
tags: [audit, admin, security]
updated: 2026-09-07
---

# Admin operator app — bug audit findings (proxy, IDOR, CSRF, CSP)

## Summary
apps/admin Next.js operator app — 12 reachable high-impact bugs found in audit (install race, proxy CSRF, IDOR via missing tenant scope, no CSRF on /api/admin/* DELETEs, tRPC accepts arbitrary JSON, no CSP headers, weak password complexity, session-fixation window, etc.).

## What worked
Use Read first with offset+limit, then targeted Grep; skip .next compiled output entirely.

## What did not work
Letting grep return huge compiled output past the read budget; ignored the consecutive-tool reminder.

## Why
Time-boxed audit of operator-facing Next.js app; bugs all reachable from documented HTTP entry points with no config flag required.

## References
- none
