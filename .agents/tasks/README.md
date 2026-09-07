# Task contracts and local runs

The tracked files under this directory define the shape of agent work:

- `schema/` contains validation contracts for epics and tasks.
- `templates/` contains starter documents.
- `runs/<date>/<task-id>/` contains local execution state and per-task `evidence.yaml`; it is ignored by Git.

A task must declare ownership, dependencies, risk areas, lessons reviewed, preflight checks, required reviews, and required gates. Dependencies must be complete with valid evidence before a dependent task closes. Never use this directory as a cumulative log.
