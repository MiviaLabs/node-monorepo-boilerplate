# Documentation standard

## Required behavior

- Document behavior that a maintainer, integrator, operator, or agent must know to use or change the system.
- Start with purpose and audience. Prefer a short runnable example, exact command, and link to the owning source over broad tutorial prose.
- Keep names, paths, versions, scripts, and architecture claims synchronized with the repository. If a document is generated, edit its source and regenerate it.
- Use JSDoc for exported APIs, non-obvious invariants, security-sensitive behavior, and operational constraints; explain why, not syntax.
- Update READMEs, API/OpenAPI material, diagrams, and migration notes when the user-visible contract changes.
- Use relative links for repository files and verify that targets exist. Avoid links to deleted legacy directories.
- Keep agent instructions separate from human product documentation. Point agents to `.agents/standards/` and `.agents/governance/` rather than duplicating their rules.

## Do not

- Do not claim support for platforms, frameworks, or packages absent from the workspace.
- Do not copy secrets, private data, raw prompts, or unverified research into repository documentation or memories.
- Do not leave stale dates, generated output, or “future” guidance presented as current behavior.

## Verification

Run Prettier and `pnpm lint:docs` for documentation/JSDoc changes. Run the relevant documentation generator when generated artifacts are in scope, then inspect links and `git diff --check`.
