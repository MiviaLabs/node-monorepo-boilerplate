---
name: agentic-runtime-governance
description: Govern changes to the repository agent contract, task lifecycle, memories, routing, and completion evidence.
---

# Agentic runtime governance

## Scope

Applies to `.agents/tasks`, `.agents/workflows`, memories, routing, completion
rules, and `scripts/agentic/task-runtime.ts`.

## When to use

Use before changing how tasks are created, validated, executed, closed, or
remembered. Use it for contract changes even when no product code changes.

## Inspect first

- `.agents/README.md`
- `.agents/governance/completion-contract.yaml`
- `.agents/governance/backend-standards.md`
- `.agents/memories/MEMORY.md`
- `.agents/memories/lessons-learned.yaml`
- `package.json`
- `scripts/agentic/task-runtime.ts`

## Required behavior

- Change canonical `.agents` inputs before any adapter or runtime output.
- Keep schemas, templates, runtime validation, workflows, memories, and evidence aligned.
- For database changes, update `packages/db-core/src/schemas` first, run
  `pnpm db:generate`, and review generated SQL before applying it.
- Close implementation tasks with `pnpm agentic:task:close`.
- Convert recurring mistakes into stronger prevention and a verification gate.

## Verification

- Run `pnpm test:agentic` after runtime or schema changes.
- Validate workflow and schema contracts when they are affected.
- Confirm task evidence names exact commands, paths, outcomes, and residual risk.

## Exclusions

Do not treat memories as executable authority, edit generated provider mirrors,
or weaken a required gate to make a task close.
