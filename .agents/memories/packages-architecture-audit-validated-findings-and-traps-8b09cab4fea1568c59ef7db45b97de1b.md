---
id: packages_architecture_audit_validated_findings_and_traps_8b09cab4fea1568c59ef7db45b97de1b
title: 'packages/ architecture audit — validated findings and traps'
content: 'Parallel-agent architecture audit of packages/ (22 pkgs) in the Nx+pnpm monorepo. Verified: all package.json main/types dangle at src/index.js (no dist consumed; webpack bundles source via tsconfig paths); @nx/enforce-module-boundaries is vacuous (wildcard depConstraints + 6-pkg allow-list); dead packages schema/i18n/secrets (zero inbound imports); no cycles; events package has dynamic require()s'
importance: high
x-scope: project
x-verdict: mixed
tags: [architecture, audit, packages, monorepo, nx, pnpm, quick-wins]
updated: 2026-09-08
---

# packages/ architecture audit — validated findings and traps

## Summary

Parallel-agent architecture audit of packages/ (22 pkgs) in the Nx+pnpm monorepo. Verified: all package.json main/types dangle at src/index.js (no dist consumed; webpack bundles source via tsconfig paths); @nx/enforce-module-boundaries is vacuous (wildcard depConstraints + 6-pkg allow-list); dead packages schema/i18n/secrets (zero inbound imports); no cycles; events package has dynamic require()s

## What worked

- none

## What did not work

- none

## Why

Ran 4 research subagents (deps, packaging, design, internet) then hand-validated headline claims. Tool-less dispatches produce no evidence — always pass agent:general-purpose. One agent claim (\"no CI whatsoever\") was flat wrong — .github/workflows/ci.yml has 7 workflows; the true gap is coverage (lint/typecheck only api+web, pkg tests only types/utils/schema/constants/errors). graph.json at root is stale (phantom packages/validation node, 7 vs ~35 edges) — don't trust it; docs generator reads package.json only, missing real imports.

## References

- packages/core/package.json
- .eslintrc.js
- .github/workflows/ci.yml
- packages/events/src/logging/logger.ts
- graph.json
