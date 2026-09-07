# GitHub Copilot provider adapter

GitHub Copilot consumes generated repository instructions, custom agents, and skills. This file states the canonical boundaries those generated surfaces must preserve.

## Start here

1. `../../AGENTS.md`
2. `../../AGENTS.md` (the provider entrypoint imports this file)
3. `../registry/providers.yaml`
4. Applicable standards under `../standards/`
5. `../memories/MEMORY.md`, followed by relevant memories and lessons
6. The applicable task under `../tasks/runs/<date>/<task-id>/task.yaml`

## Operating boundary

- Treat `.agents` as canonical for roles, aliases, workflows, tasks, skills, and provider routing.
- Use generated files under `../../.github/agents/` and `../../.github/skills/`; do not edit generated output directly.
- Treat `.github/instructions/` as compatibility aliases to `.agents/standards/`, never as an independent policy source.
- Preserve repository-native commands, authorization boundaries, and evidence-driven closure.
- Treat memories as advisory context and verify remembered claims against current code.

## Synchronization

When canonical registries, prompts, or skills change, the repository's provider-sync workflow must be run. Any generated drift is a synchronization defect, not a reason to fork provider behavior.

## Required proof

For implementation work, cite the changed paths and checks. For review work, report findings before summary. Do not label work complete without the required task evidence.
