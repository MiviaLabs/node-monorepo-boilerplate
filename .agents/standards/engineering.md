# Engineering standard

## Purpose

Keep changes understandable, typed, testable, and consistent with the existing Nx workspace.

## Required behavior

- Inspect the owning project, its `project.json`/Nx target, package manifest, and nearest instructions before editing.
- Prefer existing package utilities, schemas, error types, observability, and test helpers over a new local equivalent.
- Keep public boundaries explicit: exported types, validated inputs, stable error contracts, and documented side effects.
- Use strict TypeScript. Prefer precise types, discriminated objects, and `unknown` at untrusted boundaries; do not introduce `any` to silence an error.
- Use `camelCase` for values/functions, `PascalCase` for types/classes, and kebab-case for new filenames unless the surrounding package establishes another convention.
- Keep functions and modules cohesive. Extract a named unit when it improves a test boundary or removes meaningful duplication; do not abstract merely because two snippets look alike.
- Keep imports, formatting, and lint conventions aligned with the repository. Let Prettier and ESLint decide style.
- Add a regression test for new behavior or a bug fix. A documentation-only change may use link, render, or lint validation instead.
- Make dependency changes deliberate: justify the package, use the workspace package manager, and update lockfile state.

## Avoid

- Do not introduce a second implementation of an existing cross-cutting concern.
- Do not silently change API, database, authorization, or generated-file contracts.
- Do not mix unrelated cleanup into a focused change.
- Do not edit generated provider mirrors directly; update canonical `.agents` sources and use the repository sync command when that surface is in scope.

## Verification

Run the changed project’s Nx target first, then the relevant repository gate. At minimum, finish with `git diff --check` and confirm the diff contains only intentional files.

## Authority

`.agents/governance/` owns non-negotiable agent guardrails. Package code, tests, and build configuration own implementation facts.
