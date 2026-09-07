# Repository Agent Workflow

This repository includes a vendor-neutral agent workflow for contributors who
use coding assistants. It is optional project tooling; the repository's
commands, tests, policies, and CI remain authoritative.

## Source of truth

The canonical workflow lives under [`.agents/`](../.agents/). Its registries
define logical roles, provider adapters, skills, policies, and task schemas.
Generated provider-facing files are maintained from those sources.

## Typical lifecycle

1. Clarify the request and identify the affected risk areas.
2. Create a task run when the work needs a durable execution record:
   `pnpm agentic:task:create --id TASK-123 --title "Describe the task"`.
3. Research the relevant source, tests, and repository lessons.
4. Implement in dependency order with explicit file ownership.
5. Review the change and run the required project checks.
6. Close the task after evidence is available:
   `pnpm agentic:task:close --task <task-id-or-path>`.

## Keeping adapters synchronized

When changing `.agents/registry/`, `.agents/providers/`, or canonical skills,
run:

```bash
pnpm agentic:sync
pnpm test:agentic
```

This regenerates the Codex, Claude, GitHub Copilot, and skill-mirror surfaces.
Edit canonical `.agents/` files instead of generated adapters.

## Completion standard

Completion requires more than a code diff. Check the relevant tests, lint and
type checks, security or infrastructure gates, and any required full-stack
coverage. Preserve tenant isolation, authorization, secret handling, and the
repository's no-hook-bypass policy. The completion contract is documented in
[`../.agents/governance/completion-contract.yaml`](../.agents/governance/completion-contract.yaml).
