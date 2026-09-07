# Repository agent prompts

This directory contains canonical behavioral prompts for specialized repository roles. Registry entries own identity, capabilities, and aliases; prompts own role behavior, challenges, and required proof.

Keep prompts path-specific and imperative. Reference universal policy and skills instead of copying them. Do not invent provider personas. Generated `.claude/agents/` and `.github/agents/` files are outputs; edit these sources and use the sync workflow.

Each specialized prompt must declare its required skills. Prompts own mission,
scope, challenge questions, escalation, and evidence expectations; registries
own identity and routing; skills own procedural controls. Do not duplicate a
skill's blocking requirements in a prompt.

Specialized roles:

- `runtime-governor` — runtime contracts, registries, workflows, and adapter alignment.
- `api-tenant-safety-guardian` — tenant-scoped API, CQRS, audit, tracing, and hot paths.
- `web-auth-flow-guardian` — web authentication boundaries and protected routes.
- `admin-operator-flow-agent` — operator sessions and protected admin flows.
