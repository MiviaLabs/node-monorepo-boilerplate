# AGENTS.md

This file is the canonical, portable entrypoint for agents working in this
repository. It contains the repository-wide contract; detailed operating
material is owned by `.agents/`.

## Authority

Apply instructions in this order:

1. System, developer, and user instructions.
2. The closest applicable `AGENTS.md`.
3. `.agents/tasks/schema/` and `.agents/workflows/`.
4. Applicable `.agents/governance/` and `.agents/skills/`.
5. Provider adapters and path-specific guidance.
6. `.agents/memories/` as advisory, verified context.

Specific instructions refine broader ones but cannot weaken safety, authorization, tenant-isolation, or data-handling requirements.

## Repository contract

- Agents act as logical roles; providers are adapters.
- Agents orchestrate `pnpm`, `nx`, Jest, Playwright, Docker, and CI; they do not replace them.
- Treat `.agents/` as the canonical home for workflows, registries, skills,
  governance, standards, and memories. Provider-facing files are compatibility
  imports and generated mirrors, never independent policy sources.
- Read `.agents/memories/MEMORY.md` at the start of substantial work, then load only relevant lessons and risks.
- Use TDD for new logic and bug fixes unless the work is documentation-only or a pure refactor.
- Preserve tenant isolation, authorization, Class-C data handling, and trace continuity.
- Require real full-stack E2E for auth, session, tenant-routing, and protected-flow changes.
- Run the local hooks; never intentionally bypass a required gate. Required CI
  checks are the authoritative merge control because Git cannot prevent
  `--no-verify` locally.
- Use conventional commits and PR titles.

## Delivery loop

1. Intake the request and define scope.
2. Research only when uncertainty or risk warrants it.
3. Create a YAML task run when one does not exist:
   `pnpm agentic:task:create --id TASK-123-456 --title "Clear title" --risk-area contract`
4. Plan dependencies, ownership, risks, lessons, reviews, and checks.
5. Implement in dependency order.
6. Review changed and impacted behavior.
7. Run required gates and record exact evidence.
8. Capture durable lessons and close:
   `pnpm agentic:task:close --task <task-id-or-path>`

Task schemas/templates are tracked under `.agents/tasks/`. Runtime task files and per-task evidence live under ignored `.agents/tasks/runs/<date>/<task-id>/`; they are local execution state, not repository history.

## Navigation

- [Agent runtime overview](.agents/README.md)
- [Registry](.agents/registry/)
- [Specialized agents](.agents/agents/)
- [Provider adapters](.agents/providers/)
- [Workflows](.agents/workflows/)
- [Task contracts](.agents/tasks/)
- [Memories](.agents/memories/)
- Provider entrypoints (`CODEX.md`, `CLAUDE.md`, and
  `.github/copilot-instructions.md`) import this file and contain no separate
  contract.
