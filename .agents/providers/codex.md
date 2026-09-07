# Codex provider adapter

Codex is the repository's default execution provider. This file translates the canonical contract into a Codex entrypoint; it does not override registry, policy, skill, or task-schema decisions.

## Start here

1. `../../AGENTS.md`
2. `../../AGENTS.md` (the provider entrypoint is an import of this file)
3. `../registry/providers.yaml`
4. `../workflows/delivery-lifecycle.yaml`
5. The applicable task under `../tasks/runs/<date>/<task-id>/task.yaml`
6. `../memories/MEMORY.md`, followed by relevant memories and lessons

## Operating boundary

- Use repository-native commands and the task schema as the execution contract.
- Prefer direct inspection and reproducible tools over narrative confidence.
- Create a local task run when no run artifact exists; close it with colocated evidence.
- Keep parallel work read-only or explicitly disjoint.
- Convert meaningful failures or review findings into prevention before closure.
- Treat memories as advisory and verify them against the current tree.

## Role routing

Codex can execute every generic role in `registry/agents.yaml`. Specialized prompts under `../agents/` are selected by scope and risk, not by provider persona.

## Required proof

Run the narrowest checks that prove the change, then every required task gate. For broad changes, expand as appropriate:

```bash
pnpm lint:all
pnpm typecheck:all
pnpm test:api:unit
pnpm test:api:e2e
pnpm test:web:e2e
```

Do not claim completion until task evidence records commands, outcomes, reviews, assumptions, and residual risk.
