---
name: provider-copilot-sync
description: Synchronize canonical agent content into provider adapters without allowing generated surfaces to become authorities.
---

# Provider and Copilot synchronization

## Scope

Applies to canonical registry, provider, agent, and skill changes that have
generated `.claude` or `.github` outputs.

## When to use

Use when a canonical skill, logical agent, provider alias, or sync mapping changes.

## Inspect first

- `.agents/registry/providers.yaml`
- `.agents/registry/agents.yaml`
- `.agents/registry/skills.yaml`
- `.agents/providers/github-copilot.md`
- `scripts/agentic/sync-provider-adapters.ts`
- `.agents/README.md`

## Required behavior

- Make and review the canonical change under `.agents` first.
- Update sync logic/tests only when the mapping itself changes.
- Regenerate with `pnpm agentic:sync` when outputs are in scope.
- Keep manual path-specific Copilot instructions aligned when policy meaning changes.

## Verification

- Check registry names, aliases, and generated output paths.
- Run `pnpm test:agentic` and confirm sync is idempotent.
- Review the generated diff for loss of content or unexpected scope expansion.

## Exclusions

Do not hand-edit `.claude/` or generated `.github` surfaces, or use a provider
mirror as the canonical source.
