# 📚 Documentation

Welcome! Start with the [root README](../README.md) for a 5-minute overview.

## 🗺️ Guides

| Doc                                        | Contents                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [Architecture](architecture.md)            | 🏗️ system context, request lifecycle, transactional outbox, package layering, API module map |
| [API guide](api.md)                        | 🔌 full v1 route catalog, auth & tenant headers, throttling buckets, error model             |
| [Packages](packages.md)                    | 🧩 all 22 packages, layering rules, how to add one                                           |
| [Database](database.md)                    | 🗄️ table catalog, Drizzle migration workflow, seeding, PII conventions                       |
| [Testing](testing.md)                      | 🧪 unit / integration / e2e tiers, commands, conventions                                     |
| [Operations](operations.md)                | ⚙️ Docker stack, runtime flags, observability, security scans, CI                            |
| [Mobile](mobile.md)                        | 📱 Expo app conventions & commands                                                           |
| [Authorization](security/authorization.md) | 🛡️ authorization reference (+ machine-readable JSON)                                         |
| [Agent workflow](agent-workflow.md)        | 🤖 optional contributor tooling                                                              |

## 🗂️ Docs that live next to the code

Deeper, code-adjacent documentation is kept beside its source:

- **API**: [`apps/api/docs/`](../apps/api/docs/README.md) — auth, events, RBAC,
  i18n, testing, versioning guides
- **Packages**: `packages/*/README.md` (+ `docs/` inside some packages, e.g.
  `packages/encryption/docs`)
- **Standards & governance**: [`.agents/standards/`](../.agents/standards/README.md),
  [`AGENTS.md`](../AGENTS.md)
- **Community**: [`CONTRIBUTING.md`](../CONTRIBUTING.md),
  [`SECURITY.md`](../SECURITY.md), [`LICENSE`](../LICENSE)

## 🔄 Generated docs

Generated references are not committed; regenerate into
`.agents/docs/reference/` when needed:

```bash
pnpm docs:generate   # runs all of the below
pnpm docs:er         # ER diagram (mermaid)
pnpm docs:openapi    # OpenAPI spec from the API
pnpm docs:package-deps
pnpm docs:package-index
pnpm docs:modules
pnpm docs:packages   # typedoc markdown
pnpm docs:meta
pnpm docs:render
```

> ⚠️ Docs describe the code as it is today. If a comment and the code
> disagree, trust the code — and fix the comment.
