# Documentation Governance

## Purpose

Keep repository documentation accurate, navigable, and useful to its intended reader.

## Applies

Markdown, generated API or package documentation, public contracts, operator runbooks, and agent-facing references.

## Rules

- Document exported or externally consumed behavior that types and examples do not make obvious.
- Update documentation when public contracts, runtime behavior, configuration, or operator workflows change.
- Prefer concise, repository-specific guidance over generic tutorials or prompt-like instruction dumps.
- Use relative Markdown links and link repository files with Markdown labels.
- Identify whether a document is canonical, generated, human-facing, or agent-facing.
- Do not copy governance into provider adapters; link to the canonical source and regenerate generated surfaces.

## Verification

Run documentation lint, validate relative links, and inspect changed references. Regenerate generated docs through repository commands rather than editing them manually.

## Authority

This file governs documentation quality. `.agents/` owns agent contract documentation; `docs/` owns human-facing product and architecture documentation; executable configuration remains with its owning tool.
