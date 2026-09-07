#!/bin/bash
# Validate changed-file quality in CI.
# Local hooks are convenience checks and cannot prove that --no-verify was not used.

set -e

echo "Checking changed-file quality (independent of local hooks)..."

# Get the commit range (PR commits)
if [ -n "$GITHUB_BASE_REF" ]; then
  # Pull request
  COMMIT_RANGE="origin/$GITHUB_BASE_REF..HEAD"
else
  # Push event - check last 10 commits
  COMMIT_RANGE="HEAD~10..HEAD"
fi

echo "Checking commits in range: $COMMIT_RANGE"

# Check the changed files covered by this lightweight CI gate.
# We look for commits that were likely made with --no-verify by checking:
# 1. If formatting issues are present that should have been caught
# 2. If lint issues are present that should have been caught

# First, check prettier formatting on changed files
echo "Running prettier check on changed files..."

# Get changed files (TypeScript, JavaScript, JSON, YAML, Markdown)
# Filter to only existing files to avoid prettier errors on deleted files
CHANGED_FILES=$(git diff --name-only "$COMMIT_RANGE" 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|json|md|yml|yaml)$' | while read -r file; do [ -f "$file" ] && echo "$file"; done || true)

if [ -n "$CHANGED_FILES" ]; then
  # Check if prettier passes on changed files
  # Use printf to handle files safely and avoid xargs issues with empty input
  if ! printf '%s\n' $CHANGED_FILES | xargs -r pnpm prettier --check; then
    echo "::error::Prettier formatting errors detected."
    echo "::error::Run 'pnpm prettier --write <files>' to fix formatting issues."
    exit 1
  fi
  echo "✓ Prettier check passed"
else
  echo "✓ No formattable files changed"
fi

# Lint the API project directly instead of via Nx. This script is a lightweight
# hook-audit check, and `nx lint api` has proven flaky in CI due to wrapper-level
# aborts even when the underlying ESLint/TypeScript steps pass.
echo "Running quick lint check..."
API_LINT_FILES=$(printf '%s\n' "$CHANGED_FILES" | grep -E '^apps/api/.*\.(ts|tsx)$' || true)
if [ -n "$API_LINT_FILES" ]; then
  if ! printf '%s\n' "$API_LINT_FILES" | xargs -r pnpm exec eslint --rule '@nx/enforce-module-boundaries: off'; then
    echo "::error::Linting errors detected in changed API files."
    echo "::error::Please fix linting issues and ensure pre-commit hooks are run before committing."
    exit 1
  fi
fi

if ! pnpm exec tsc --project apps/api/tsconfig.app.json --noEmit; then
  echo "::error::Type checking errors detected in API."
  echo "::error::Please fix type errors and ensure pre-commit hooks are run before committing."
  exit 1
fi

# Web app lint check - call ESLint directly for the same reason as API above.
WEB_LINT_FILES=$(printf '%s\n' "$CHANGED_FILES" | grep -E '^apps/web/.*\.(ts|tsx|js|jsx)$' || true)
if [ -n "$WEB_LINT_FILES" ] && [ -f "apps/web/project.json" ] && grep -q '"lint"' apps/web/project.json ; then
  if ! printf '%s\n' "$WEB_LINT_FILES" | xargs -r pnpm exec eslint --rule '@nx/enforce-module-boundaries: off'; then
    echo "::error::Linting errors detected in changed web files."
    echo "::error::Please fix linting issues and ensure pre-commit hooks are run before committing."
    exit 1
  fi
fi

echo "✓ Changed-file quality checks passed"
