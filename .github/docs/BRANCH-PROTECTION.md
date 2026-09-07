# GitHub Branch Protection Setup

This document outlines the required GitHub branch protection settings to enforce the CODEOWNERS rules.

## Critical Files Requiring Protection

The following files and directories can **only** be modified by `your-maintainer`:

- `CODEOWNERS` (this file)
- `.github/` (all CI/CD workflows and configurations)
- `.husky/` (all git hooks)
- Root configuration files (`package.json`, `nx.json`, `tsconfig*.json`, etc.)
- `.agents/` (agent runtime configuration)

## Required Branch Protection Settings

### Protected Branches: `main`, `dev`

#### 1. Branch Protection Rules

For each protected branch (`main`, `dev`), configure:

**Restrict who can push to matching branches:**

- ✅ Only allow: `your-maintainer`

**Restrict who can bypass rules:**

- ✅ Only allow: `your-maintainer`

#### 2. Pull Request Requirements

- ✅ Require a pull request before merging
  - Require approvals: **1** approval
  - Dismiss stale reviews when new commits are pushed
  - Require review from CODEOWNERS
  - **Require approval from the most recent review request**

#### 3. Required Status Checks

- ✅ Require status checks to pass before merging
  - Require branches to be up to date before merging
  - Select these required checks:
    - `CI / Lint`
    - `CI / Typecheck`
    - `CI / Build` - **Required since pre-push builds are disabled**
    - `CI / TruffleHog Secret Scanning`
    - `CI - Unit Tests / Test Packages`
    - `CI - Unit Tests / Test API Unit (1/3)`
    - `CI - Unit Tests / Test API Unit (2/3)`
    - `CI - Unit Tests / Test API Unit (3/3)`
    - `CI - Unit Tests / Security Audit`
    - `CI - E2E Tests / Test API E2E (1/3)`
    - `CI - E2E Tests / Test API E2E (2/3)`
    - `CI - E2E Tests / Test API E2E (3/3)`

> **Note:** Status check names may vary depending on GitHub configuration. The format is typically
> `{Workflow Name} / {Job Name}` (e.g., "CI / Build").

#### 4. Additional Protections

- ✅ Do not allow bypassing the above settings
- ✅ Require branches to be up to date before merging
- ✅ Require linear history (force merge/rebase)
- ✅ Require conversation resolution before merging

## Setup Instructions

### Via GitHub UI

1. Go to **Settings** → **Branches**
2. Click **Add branch protection rule**
3. Enter branch name pattern: `main` or `dev`
4. Configure settings as listed above
5. Click **Create** or **Save changes**

### Via GitHub CLI

```bash
#!/usr/bin/env bash

# Strict error handling - fail on any error, undefined variable, or pipe failure
set -euo pipefail

# Verify gh CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
  echo "Error: GitHub CLI (gh) is not installed. Install from https://cli.github.com/"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo "Error: GitHub CLI is not authenticated. Run 'gh auth login' first."
  exit 1
fi

# Get repository name dynamically
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
if [ -z "$REPO" ]; then
  echo "Error: Not in a GitHub repository or unable to determine repo name."
  exit 1
fi

# Configurable bypass user (can be overridden via environment variable)
# Validate: alphanumeric, dots, hyphens, underscores only; max 64 chars
BYPASS_USER="${BYPASS_USER:-your-maintainer}"
if [[ ! "$BYPASS_USER" =~ ^[A-Za-z0-9._-]{1,64}$ ]]; then
  echo "Error: Invalid BYPASS_USER format. Must be alphanumeric with ._- only, max 64 chars."
  echo "Falling back to default: your-maintainer"
  BYPASS_USER="your-maintainer"
fi

# Build the protection payload using jq for proper JSON encoding
PROTECTION_PAYLOAD=$(jq -n \
  --arg bypass_user "$BYPASS_USER" \
  '{
    required_status_checks: {
      strict: true,
      checks: [
        {context: "CI / Lint"},
        {context: "CI / Typecheck"},
        {context: "CI / Build"},
        {context: "CI / TruffleHog Secret Scanning"},
        {context: "CI - Unit Tests / Test Packages"},
        {context: "CI - Unit Tests / Test API Unit (1/3)"},
        {context: "CI - Unit Tests / Test API Unit (2/3)"},
        {context: "CI - Unit Tests / Test API Unit (3/3)"},
        {context: "CI - Unit Tests / Security Audit"},
        {context: "CI - E2E Tests / Test API E2E (1/3)"},
        {context: "CI - E2E Tests / Test API E2E (2/3)"},
        {context: "CI - E2E Tests / Test API E2E (3/3)"}
      ]
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      require_code_owner_reviews: true,
      dismiss_stale_reviews: true,
      bypass_pull_request_allowances: {users: [$bypass_user]}
    },
    restrictions: {users: [$bypass_user], teams: [], apps: []},
    allow_force_pushes: false,
    allow_deletions: false,
    required_linear_history: true
  }')

# Display configuration and request confirmation
echo "========================================"
echo "Branch Protection Configuration"
echo "========================================"
echo "Repository: $REPO"
echo "Bypass User: $BYPASS_USER"
echo "Required Status Checks: 12"
echo "Branches to protect: main, dev"
echo "========================================"
echo ""
read -p "Apply branch protection to $REPO? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Apply protection to main branch
echo "Applying protection to main branch..."
echo "$PROTECTION_PAYLOAD" | gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/branches/main/protection" \
  --input -

echo "✓ main branch protected"

# Apply same protection to dev branch
echo "Applying protection to dev branch..."
echo "$PROTECTION_PAYLOAD" | gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/branches/dev/protection" \
  --input -

echo "✓ dev branch protected"
echo ""
echo "Branch protection applied successfully to both main and dev branches."
```

## CODEOWNERS File Behavior

When a pull request modifies files owned by `your-maintainer`:

1. GitHub automatically requests review from `your-maintainer`
2. The PR cannot be merged until `your-maintainer` approves
3. Even `your-maintainer` must approve their own PRs (due to "Require review from CODEOWNERS")
4. Branch protection rules ensure no one can bypass these requirements

## Verification

To verify the setup is working:

1. Create a test branch
2. Modify a file in `.github/` or `.husky/`
3. Create a pull request
4. Verify that:
   - `your-maintainer` is automatically requested as a reviewer
   - The PR cannot be merged without approval
   - Branch protection prevents direct pushes to protected branches

## Emergency Bypass

In case of emergency, `your-maintainer` can:

1. Temporarily disable branch protection (not recommended)
2. Use the "Admin bypass" if they are a repository admin
3. Create a new branch and update the protection rules

For security reasons, emergency bypasses should be documented and reviewed afterwards.
