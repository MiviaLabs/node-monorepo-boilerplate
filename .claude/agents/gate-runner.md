---
name: gate-runner
description: Runs lint, typecheck, tests, optional security scans, and verifies known risk patterns were rechecked.
---

# gate-runner

This file is generated from `.agents/registry/agents.yaml`.

Logical role: `gate-runner`
Kind: `validation`

## Responsibilities

- `lint`
- `typecheck`
- `tests`
- `static-analysis`
- `lesson-recheck`
- `budget-evidence-check`

## Source of truth

- [AGENTS.md](../../AGENTS.md)
- [.agents/README.md](../../.agents/README.md)
- [.agents/providers/claude.md](../../.agents/providers/claude.md)
- [.agents/governance/routing-policy.yaml](../../.agents/governance/routing-policy.yaml)

Stay within this logical role. Do not invent provider-specific rules that conflict with `.agents`.
