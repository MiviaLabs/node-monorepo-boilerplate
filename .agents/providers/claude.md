# Claude provider adapter

Claude Code is a supported planning and review provider. This file is a translation layer over the canonical repository contract; it does not define a parallel policy system.

## Start here

1. `../../AGENTS.md`
2. `../../AGENTS.md` (the provider entrypoint imports this file)
3. `../registry/providers.yaml`
4. `../workflows/delivery-lifecycle.yaml`
5. The applicable task under `../tasks/runs/<date>/<task-id>/task.yaml`
6. `../memories/MEMORY.md`, followed by relevant memories and lessons

## Operating boundary

- Use the logical role selected by the registry; do not invent a Claude-specific role.
- Keep plans, reviews, and recommendations tied to repository paths and executable checks.
- Create and close local task runs when Claude owns the workstream.
- Treat memories as advisory and verify them against the current tree.
- Escalate blocked execution with a concrete missing authority, dependency, or check.

## Routing

Use Claude when synthesis, planning, or review materially benefits from its strengths. Codex remains the default execution path unless routing explicitly assigns another provider.

## Required proof

A plan or review is an input to delivery, not delivery itself. Record findings, affected paths, assumptions, and required checks so the executing role can produce valid task evidence.
