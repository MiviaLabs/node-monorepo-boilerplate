# Memories

This directory stores durable, repository-scoped memory for future agent runs.

- `MEMORY.md`: curated context, decisions, and durable operating knowledge.

- `lessons-learned.yaml`: concrete mistakes, prevention, and verification.
- `risk-patterns.yaml`: high-level domains that require lessons review and stronger validation.

At session start, read `MEMORY.md` and only then load relevant lessons or risk patterns.
Treat memory as guidance, not authority: verify it against the current repository before acting.
Write only durable, repository-scoped facts and decisions; never store secrets, tokens, or personal data.
Update the curated file after meaningful work, and keep entries short, dated, and attributable to a task or decision.
Lessons are only considered captured when the lesson ID exists in `lessons-learned.yaml` and the closing task evidence references that same ID.
