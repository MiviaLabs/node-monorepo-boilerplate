# Canonical skills

This directory is the hand-edited library of reusable agent procedures. A skill
is a focused operating guide, not a replacement for repository policy, tests,
or implementation tooling.

## How to use a skill

1. Select the skill whose scope matches the files and risk of the task.
2. Read its `When to use`, `Inspect first`, and `Required behavior` sections.
3. Load only the referenced material needed to make the decision.
4. Run the skill's verification gates and record the exact commands in task evidence.

## Ownership

- `.agents/skills/**` is canonical and hand-edited.
- `.agents/registry/skills.yaml` owns discovery metadata and aliases.
- `.claude/skills/` and `.github/skills/` are generated provider mirrors; do not edit them here.
- Provider synchronization is a separate, explicitly requested operation.

## Writing standard

Every skill entrypoint uses front matter and states its scope, activation
conditions, inspection set, required behavior, verification, and exclusions.
Keep rules imperative, repository-specific, and testable. Defer universal
guardrails to the canonical contract instead of duplicating them.
