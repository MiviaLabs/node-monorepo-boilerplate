---
id: dangling_main_fields_masked_a_tsconfig_app_json_paths_gap_package_tasks_118ba9ca0a7ea464e1969cbb53f2220c
title: 'Dangling "main" fields masked a tsconfig.app.json paths gap (@package/tasks)'
content: 'Removing dangling "main"/"types" from package manifests can break tsc apps/api/tsconfig.app.json: that config overrides tsconfig.base.json paths and omitted @package/tasks, and packages/queues/src statically imports it. It only resolved before via TS''s main-field .ts-substitution on the dangling "./src/index.js". Fixed by adding "@package/tasks" to the app paths (commit a1c771c).'
importance: high
x-scope: project
x-verdict: mixed
tags: [pnpm-workspace, tsconfig-paths, module-resolution, manifest-cleanup]
updated: 2026-09-08
---

# Dangling "main" fields masked a tsconfig.app.json paths gap (@package/tasks)

## Summary

Removing dangling "main"/"types" from package manifests can break tsc apps/api/tsconfig.app.json: that config overrides tsconfig.base.json paths and omitted @package/tasks, and packages/queues/src statically imports it. It only resolved before via TS's main-field .ts-substitution on the dangling "./src/index.js". Fixed by adding "@package/tasks" to the app paths (commit a1c771c).

## What worked

- Removing dangling "main"/"types"/"exports" from source-consumed packages is safe ONLY where consumers resolve via tsconfig paths (tsconfig.base.json)
- apps/api/tsconfig.app.json OVERRIDES base paths: any @package/\* imported by transitively-compiled package sources must be listed there or resolution falls to node_modules
- Pre-fix, queues→@package/tasks resolved ONLY because TS falls back from dangling "main": "./src/index.js" to ./src/index.ts; stash-isolated HEAD run proved the latent gap

## What did not work

Assuming manifest-based node_modules resolution would keep working after stripping entry points; trusting a green tsc run without asking what made it green (the dangling fields were load-bearing via an undocumented fallback).

## Why

Future slices touching manifests or api tsconfigs will hit the same class of failure: any package whose entry lives at src/index.ts and whose consumer resolves via node_modules (not paths) loses resolution once dangling entry points are removed. The api app tsconfig is the only config that overrides paths with a subset of base aliases.

## References

- apps/api/tsconfig.app.json
- packages/queues/src/providers/cloud-tasks.adapter.ts
- packages/tasks/package.json
- tsconfig.base.json
