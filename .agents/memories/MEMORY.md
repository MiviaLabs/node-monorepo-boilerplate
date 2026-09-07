# Repository Memory

This is curated, durable memory for agents working in this repository. It is intentionally plain Markdown so it remains portable across tools that understand `AGENTS.md`.

## Read and write protocol

At the beginning of every substantial task:

1. Read this file before planning or editing.
2. Load only the relevant lesson and risk-pattern entries from this directory.
3. Verify remembered claims against the current source, tests, and workflows.

After meaningful work:

1. Record only durable repository facts, decisions, recurring pitfalls, or unfinished follow-up.
2. Include the date and task identifier when one exists.
3. Never record secrets, credentials, private user data, raw prompts, or unverifiable guesses.
4. Prefer updating an existing entry over adding a duplicate.

Task evidence is separate from memory. Evidence belongs in the ignored per-task directory under `.agents/tasks/runs/<date>/<task-id>/evidence.yaml`; it is not a cumulative memory store.

## Durable repository context

- `.agents/` is the canonical, vendor-neutral agent contract.
- `AGENTS.md` is the portable repository entrypoint; provider files are generated adapters.
- Task schemas and templates are tracked; task runs and evidence are local runtime artifacts.
- Required checks must be verified by repository tooling, not inferred from prose.

## Decisions

- 2026-09-07 — Keep durable lessons and risk patterns in `.agents/memories/`, but keep task-specific execution state and evidence ignored and colocated with each task.
- 2026-09-07 — Treat `AGENTS.md` as a Markdown convention, not a rigid protocol schema; keep the machine-enforced contract in repository tooling.
