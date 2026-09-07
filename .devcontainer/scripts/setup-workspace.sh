#!/usr/bin/env bash
# DevContainer Workspace Setup and Validation
#
# Purpose: Ensures consistent package manager usage (pnpm only) and cleans
#          up any npm-installed dependencies that could cause conflicts.
#
# Usage: Called automatically by devcontainer postCreateCommand
#        Can also be run manually: bash .devcontainer/scripts/setup-workspace.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

# ============================================================================
# STEP 1: Verify pnpm is available
# ============================================================================
verify_pnpm() {
  log_info "Verifying pnpm installation..."

  if ! command -v pnpm >/dev/null 2>&1; then
    log_error "pnpm not found in PATH"
    log_info "Attempting to enable corepack..."

    if command -v corepack >/dev/null 2>&1; then
      corepack enable pnpm
      log_success "pnpm enabled via corepack"
    else
      log_error "corepack not available. Cannot proceed."
      exit 1
    fi
  fi

  PNPM_VERSION=$(pnpm --version)
  log_success "pnpm ${PNPM_VERSION} is available"
}

# ============================================================================
# STEP 2: Clean up npm artifacts in individual packages
# ============================================================================
cleanup_npm_artifacts() {
  log_info "Checking for npm artifacts in workspace packages..."

  local npm_lockfiles_found=0

  # Find and remove package-lock.json files (npm lockfiles)
  while IFS= read -r -d '' lockfile; do
    log_warning "Found npm lockfile: ${lockfile}"
    rm -f "$lockfile"
    ((npm_lockfiles_found++))
  done < <(find packages apps -name "package-lock.json" -type f -print0 2>/dev/null || true)

  # Check for package.json with npm-specific configuration (packageManager set to npm)
  while IFS= read -r package_json; do
    if grep -q '"packageManager".*npm' "$package_json" 2>/dev/null; then
      log_warning "Found npm packageManager setting in: ${package_json}"
    fi
  done < <(find packages apps -name "package.json" -type f 2>/dev/null || true)

  if [ "$npm_lockfiles_found" -gt 0 ]; then
    log_success "Removed ${npm_lockfiles_found} npm lockfile(s)"
  else
    log_success "No npm lockfiles found"
  fi
}

# ============================================================================
# STEP 3: Validate workspace configuration
# ============================================================================
validate_workspace() {
  log_info "Validating pnpm workspace configuration..."

  # Check for pnpm-workspace.yaml
  if [ ! -f "pnpm-workspace.yaml" ]; then
    log_error "pnpm-workspace.yaml not found"
    exit 1
  fi
  log_success "pnpm-workspace.yaml exists"

  # Check for pnpm-lock.yaml
  if [ ! -f "pnpm-lock.yaml" ]; then
    log_warning "pnpm-lock.yaml not found (will be created on install)"
  else
    log_success "pnpm-lock.yaml exists"
  fi

  # Check .npmrc configuration
  if [ -f ".npmrc" ]; then
    log_success ".npmrc configuration found"

    # Verify shamefully-hoist is enabled
    if grep -q "shamefully-hoist=true" .npmrc; then
      log_success "shamefully-hoist enabled (required for workspace)"
    else
      log_warning "shamefully-hoist not enabled in .npmrc"
    fi
  else
    log_warning ".npmrc not found"
  fi
}

# ============================================================================
# STEP 4: Verify git configuration
# ============================================================================
verify_git_config() {
  log_info "Verifying git configuration..."

  # Check if git user is configured
  if ! git config user.email >/dev/null 2>&1; then
    log_warning "Git user.email not configured"
    log_info "Setting default git user.email for devcontainer..."
    git config --global user.email "devcontainer@example.com"
  fi

  if ! git config user.name >/dev/null 2>&1; then
    log_warning "Git user.name not configured"
    log_info "Setting default git user.name for devcontainer..."
    git config --global user.name "DevContainer User"
  fi

  log_success "Git user: $(git config user.name) <$(git config user.email)>"
}

# ============================================================================
# STEP 5: Verify Husky hooks are initialized
# ============================================================================
verify_husky() {
  log_info "Verifying Husky git hooks..."

  if [ ! -d ".husky" ]; then
    log_warning "Husky hooks directory not found"
    log_info "Husky hooks will be initialized by 'pnpm install' (prepare script)"
  fi

  # Check if key hooks exist
  local required_hooks=("pre-commit" "pre-push" "commit-msg")
  local missing_hooks=()

  for hook in "${required_hooks[@]}"; do
    if [ ! -f ".husky/${hook}" ]; then
      missing_hooks+=("$hook")
    fi
  done

  if [ ${#missing_hooks[@]} -gt 0 ]; then
    log_warning "Missing hooks: ${missing_hooks[*]}"
  else
    log_success "All required Husky hooks present"
  fi
}

# ============================================================================
# STEP 6: Check for tool installations
# ============================================================================
verify_tools() {
  log_info "Verifying development tools..."

  local tools=(
    "node:Node.js"
    "pnpm:pnpm"
    "git:Git"
    "gh:GitHub CLI"
    "docker:Docker"
    "semgrep:Semgrep"
    "actionlint:Actionlint"
    "shellcheck:Shellcheck"
    "codeql:CodeQL CLI"
    "claude:Claude Code CLI"
  )

  local missing_tools=()

  for tool_entry in "${tools[@]}"; do
    IFS=':' read -r cmd name <<< "$tool_entry"
    if command -v "$cmd" >/dev/null 2>&1; then
      log_success "${name} installed"
    else
      log_warning "${name} not found"
      missing_tools+=("$name")
    fi
  done

  if [ ${#missing_tools[@]} -gt 0 ]; then
    log_warning "Some optional tools are missing: ${missing_tools[*]}"
    log_info "These tools will be available after full devcontainer build"
  fi
}

# ============================================================================
# Main execution
# ============================================================================
main() {
  echo ""
  log_info "========================================"
  log_info "DevContainer Workspace Setup"
  log_info "========================================"
  echo ""

  verify_pnpm
  cleanup_npm_artifacts
  validate_workspace
  verify_git_config
  verify_husky
  verify_tools

  echo ""
  log_success "========================================"
  log_success "Workspace setup complete!"
  log_success "========================================"
  echo ""

  log_info "Next steps:"
  log_info "  1. Run 'pnpm dev:start' to start Docker services"
  log_info "  2. Run 'pnpm dev:api' to start the API server"
  log_info "  3. Run 'pnpm dev:web' to start the web app"
  echo ""
}

# Run main function
main "$@"
