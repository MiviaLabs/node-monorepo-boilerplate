---
name: runtime-instruction-alignment
description: Keep the portable agent entrypoint, canonical `.agents` model, and provider-facing instructions aligned.
---

# Runtime instruction alignment

## Scope

Applies to `AGENTS.md`, `.agents`, provider adapters, custom aliases, and
generated instruction surfaces.

## When to use

Activate when a canonical agent contract, skill, registry entry, or provider
mapping changes.

## What to inspect first

- `.agents/README.md`
- `.agents/registry/agents.yaml`
- `.agents/registry/providers.yaml`
- `.agents/registry/skills.yaml`
- `scripts/agentic/sync-provider-adapters.ts`
- `AGENTS.md`

## Required behavior

- Change `.agents` first and identify every affected surface.
- Distinguish provider entrypoints, logical agents, canonical skills, and manual
  path-specific instructions.
- Update generator logic/tests before regenerating when mappings change.
- Run `pnpm agentic:sync` after registry or skill changes when outputs are in scope.

## Verification

- Confirm `.agents` is the only hand-edited source for aliases and canonical skills.
- Check generated drift with the repository sync test.

## Exclusions

Do not hand-edit `.claude/` or generated Copilot files, or let provider-specific
formatting redefine the neutral contract.
