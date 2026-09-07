# Agent registry

The registry is the inventory of capabilities available to the orchestrator.

- `agents.yaml` defines generic logical roles and provider aliases.
- `custom-agents.yaml` defines bounded repository prompts and their generated mirrors.
- `providers.yaml` defines provider strengths, entrypoints, and routing boundaries.
- `teams.yaml` defines safe collaboration groups.
- `skills.yaml` defines operations and reusable procedures.

Names are API-like identifiers: change them only with a migration of consumers. Registry metadata must agree with task-schema enums and workflow vocabulary. Descriptions explain selection intent; they do not replace executable checks.
