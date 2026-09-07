# Agent operating system

`.agents/` is the repository's canonical, provider-neutral operating model. It defines roles, lifecycle, machine-checked task contracts, and provider boundaries.

## Authority and precedence

Resolve instructions in this order:

1. System, developer, and user instructions.
2. The closest applicable `AGENTS.md`.
3. Task schemas and workflow definitions in this directory.
4. Applicable `.agents/governance/*` contracts.
5. Applicable canonical skills under `.agents/skills/`.
6. Provider adapters in `.agents/providers/`.
7. Memories and lessons as advisory context, verified against the current tree.

Specific path instructions refine broader instructions; they cannot weaken higher-priority safety or authorization rules. An adapter translates the contract for a tool and never creates a competing rule.

## Canonical surfaces

- `registry/` — roles, providers, teams, and skills.
- `agents/` — behavioral prompts for repository-specific roles.
- `workflows/` — lifecycle phases and review loops.
- `tasks/schema/` — machine-readable task and epic contracts.
- `tasks/templates/` — starting documents for new runs.
- `providers/` — provider-specific entrypoints and boundaries.

Separate ownership applies to `governance/` (mandatory agent contract and completion policy), `standards/` (repository engineering guidance), `skills/` (task procedures), and `memories/` (durable verified context). Root `AGENTS.md` is the canonical portable entrypoint. Root provider files are `@AGENTS.md` compatibility imports; `.claude/` and `.github/` are generated provider surfaces and must not be edited by hand.

## Tracked contracts and local state

Commit registries, workflows, prompts, schemas, templates, and adapters. Task execution state is local: create it under `tasks/runs/<date>/<task-id>/`. Its `task.yaml` and colocated `evidence.yaml` are ignored by Git and are not a cumulative project log.

```bash
pnpm agentic:task:create --id TASK-123-456 --title "Clear task title" --risk-area contract
pnpm agentic:task:close --task TASK-123-456
```

## Lifecycle

Intake preserves the request. Research reduces material uncertainty. Planning assigns ownership, dependencies, risks, lessons, and gates. Implementation changes only owned files. Review checks changed and impacted behavior. Validation runs required gates and records exact evidence. Learning capture records durable verified improvements. Closure requires valid status and colocated evidence.

Use parallel agents only for read-only research or disjoint ownership. A plan, passing unit test, or verbal review never substitutes for a required gate.

## Provider model

Roles are stable capabilities such as `planner`, `reviewer`, and `gate-runner`. Codex, Claude, GitHub Copilot, and read-only external providers are adapters selected by routing, not separate rule systems. The registry is authoritative for supported aliases; canonical changes must flow through the repository's sync workflow.
