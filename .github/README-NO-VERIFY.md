# Required validation and hook bypasses

## Policy

Local hooks should always run. Do not use `--no-verify`, `SKIP_HUSKY`, or
similar bypasses to avoid a failing check.

## Why These Are Dangerous

1. **Bypasses security checks** - Gitleaks secret scanning is skipped
2. **Bypasses code quality** - Linting, formatting, type checking are skipped
3. **Creates technical debt** - Broken code enters the codebase
4. **Compromises CI/CD** - CI becomes the only gate, slowing down development

## The Truth About --no-verify

**--no-verify CANNOT be blocked by hooks** - that's its entire purpose. Git skips ALL hooks when this flag is used.

### Enforcement model

Git can skip local hooks by design, so local hooks are convenience gates. The
authoritative controls are:

1. **CI/CD gates** - independent changed-file quality, agent-contract, test,
   security, and build checks.
2. **Branch protection** - required status checks must be enabled on protected
   branches.
3. **Code review** - review the actual diff and reported gate evidence.

The CI quality job validates changed files; it does not claim to prove that a
local hook ran.

## What To Do When Hooks Fail

### 1. Read the error message

The hook tells you exactly what's wrong.

### 2. Fix the actual issue

```bash
# Linting errors
npm run lint

# Type errors
npm run typecheck

# Test failures
npm run test

# Secrets detected
Remove the secret, use environment variables
```

### 3. Verify the fix

```bash
# Run the same checks manually
npm run lint
npm run test
```

### 4. Commit normally

```bash
git commit -m "fix: description"
```

## For AI Assistants

AI assistants (Claude, Copilot, etc.) are **NEVER** allowed to:

- Suggest using `--no-verify`
- Suggest using `SKIP_HUSKY=1`
- Execute commits with bypass flags

If a hook is failing and unclear:

1. Report the error to the user
2. Ask how to proceed
3. Wait for human instruction

## Enforcement references

- **AI**: Core guardrails in `.agents/governance/core-guardrails.md`
- **CI**: `Changed-File Quality`, `Validate Agentic Contract`, and required
  project/security jobs fail on quality issues
- **Code Review**: Review the actual diff and CI results; do not infer hook
  execution from formatting alone
