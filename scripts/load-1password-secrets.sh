#!/bin/sh
# =============================================================================
# 1Password Secrets Loader
# =============================================================================
# This script loads secrets from 1Password Secure Notes at runtime.
# It is designed to be sourced by entrypoint.sh scripts.
#
# Environment Variables:
#   OP_ENABLED           - Set to "true" to enable (default: disabled)
#   OP_SERVICE_ACCOUNT_TOKEN - Required 1Password service account token
#                          Note: Service accounts authenticate automatically
#                          No additional authentication step needed
#   OP_VAULT_ID          - Vault ID or name (default: runtime-secrets)
#   OP_ITEM_NAME         - Secure Note name (default: Runtime Secrets)
#   OP_FIELD_NAME        - Optional: Specific field name for text-based format
#                         (default: "notes" or first field with newlines)
#
# Supported Formats:
#   1. Field-based: Each field = one env var (label=name, value=value)
#   2. Text-based: One field contains KEY=VALUE pairs (one per line)
#
# Usage:
#   . /app/scripts/load-1password-secrets.sh
#
# Returns:
#   0 - Success (secrets loaded or integration disabled)
#   1 - Error (missing required vars, auth failed, etc.)
# =============================================================================

# Exit on error
set -e

# =============================================================================
# VALIDATION
# =============================================================================

# Check if 1Password integration is enabled
if [ "${OP_ENABLED}" != "true" ]; then
  echo "ℹ️  1Password integration disabled (OP_ENABLED not set to 'true')"
  echo "   Using environment variables from platform/config only"
  return 0
fi

# Validate required environment variables
if [ -z "${OP_SERVICE_ACCOUNT_TOKEN}" ]; then
  echo "❌ ERROR: OP_SERVICE_ACCOUNT_TOKEN is required when OP_ENABLED=true"
  echo "   Set OP_SERVICE_ACCOUNT_TOKEN in your platform's environment variables"
  return 1
fi

# Check if 1Password CLI is available
if ! command -v op >/dev/null 2>&1; then
  echo "❌ ERROR: 1Password CLI (op) not found"
  echo "   Ensure Dockerfile installs op CLI"
  return 1
fi

# Check if jq is available
if ! command -v jq >/dev/null 2>&1; then
  echo "❌ ERROR: jq not found"
  echo "   Ensure Dockerfile installs jq"
  return 1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Set defaults
OP_VAULT_ID="${OP_VAULT_ID:-runtime-secrets}"
OP_ITEM_NAME="${OP_ITEM_NAME:-Runtime Secrets}"
OP_FIELD_NAME="${OP_FIELD_NAME:-notes}"

# =============================================================================
# AUTHENTICATION
# =============================================================================

echo "🔐 Fetching secrets from 1Password..."
echo "   Vault: ${OP_VAULT_ID}"
echo "   Item: ${OP_ITEM_NAME}"

# Export service account token for 1Password CLI
# The CLI automatically detects and uses this environment variable
# No explicit authentication step is needed for service accounts
export OP_SERVICE_ACCOUNT_TOKEN

# =============================================================================
# FETCH SECRETS
# =============================================================================

# Fetch the item from 1Password
ITEM_JSON=$(op item get "${OP_ITEM_NAME}" --vault "${OP_VAULT_ID}" --format json 2>/dev/null) || {
  echo "❌ ERROR: Failed to fetch item '${OP_ITEM_NAME}' from vault '${OP_VAULT_ID}'"
  echo "   Verify:"
  echo "   - Service account has 'Read Items' permission"
  echo "   - Vault ID/name is correct"
  echo "   - Item name is correct"
  echo "   - Item exists in the vault"
  return 1
}

# Check if item has fields
if ! echo "$ITEM_JSON" | jq -e '.fields' >/dev/null 2>&1; then
  echo "❌ ERROR: Item has no fields"
  echo "   Ensure Secure Note has fields with labels and values"
  return 1
fi

# =============================================================================
# DETECT FORMAT TYPE
# =============================================================================

# Check if any field contains newlines (indicating text-based format)
HAS_NEWLINES=$(echo "$ITEM_JSON" | jq -r '.fields[] | select(.value != null) | .value' | grep -c $'\n' || true)

if [ "$HAS_NEWLINES" -gt 0 ]; then
  FORMAT="text"
else
  FORMAT="field"
fi

echo "   Format detected: ${FORMAT}-based"

# =============================================================================
# EXPORT SECRETS AS ENVIRONMENT VARIABLES
# =============================================================================

SECRETS_LOADED=0
SECRETS_FAILED=0

if [ "$FORMAT" = "text" ]; then
  # =============================================================================
  # TEXT-BASED FORMAT: Parse KEY=VALUE pairs from field content
  # =============================================================================

  # Find the field with newlines (or use OP_FIELD_NAME if specified)
  if [ -n "${OP_FIELD_NAME}" ]; then
    FIELD_VALUE=$(echo "$ITEM_JSON" | jq -r --arg name "${OP_FIELD_NAME}" '.fields[] | select(.label == $name) | .value')
  else
    # Auto-detect: find first field with newlines
    FIELD_VALUE=$(echo "$ITEM_JSON" | jq -r '.fields[] | select(.value != null) | .value' | head -1)
  fi

  if [ -z "${FIELD_VALUE}" ]; then
    echo "❌ ERROR: No field found with environment variables"
    echo "   Check OP_FIELD_NAME or ensure a field contains KEY=VALUE pairs"
    return 1
  fi

  # Parse KEY=VALUE lines (handling quoted values and comments)
  # Use a temporary file to process without subshell issues
  TEMP_FILE=$(mktemp)
  echo "$FIELD_VALUE" > "$TEMP_FILE"

  SECRETS_LOADED=0
  SECRETS_FAILED=0

  while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    case "$line" in
      ''|\#*) continue ;;
    esac

    # Parse KEY=VALUE
    NAME="${line%%=*}"
    VALUE="${line#*=}"

    # Validate
    if [ -z "${NAME}" ]; then
      echo "⚠️  Warning: Skipping line with empty key"
      SECRETS_FAILED=$((SECRETS_FAILED + 1))
      continue
    fi

    if [ -z "${VALUE}" ]; then
      echo "⚠️  Warning: Skipping '${NAME}' (empty value)"
      SECRETS_FAILED=$((SECRETS_FAILED + 1))
      continue
    fi

    # Validate environment variable name
    if ! echo "$NAME" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*$'; then
      echo "⚠️  Warning: Skipping '${NAME}' (invalid env var name)"
      SECRETS_FAILED=$((SECRETS_FAILED + 1))
      continue
    fi

    # Block dangerous variable names
    DANGEROUS_VARS="PATH LD_PRELOAD IFS PS1 PS2 PS4 ENV BASH_ENV LD_LIBRARY_PATH"
    for dangerous in $DANGEROUS_VARS; do
      if [ "$NAME" = "$dangerous" ]; then
        echo "⚠️  Warning: Skipping '${NAME}' (reserved variable name)"
        SECRETS_FAILED=$((SECRETS_FAILED + 1))
        continue 2
      fi
    done

    # Export as environment variable (this persists to parent shell!)
    export "$NAME"="$VALUE"
    SECRETS_LOADED=$((SECRETS_LOADED + 1))

    # Log success
    echo "   ✅ Loaded: ${NAME}"
  done < "$TEMP_FILE"

  rm -f "$TEMP_FILE"
else
  # =============================================================================
  # FIELD-BASED FORMAT: Each field is one environment variable
  # =============================================================================

  # Use a temporary file to avoid process substitution (not POSIX-compliant)
  TEMP_FIELDS=$(mktemp)
  echo "$ITEM_JSON" | jq -r '.fields[] | @base64' > "$TEMP_FIELDS"

  while IFS= read -r row; do
    field=$(echo "$row" | base64 -d)
    NAME=$(echo "$field" | jq -r '.label')
    VALUE=$(echo "$field" | jq -r '.value')

    # Validate field has both label and value
    if [ -z "${NAME}" ]; then
      echo "⚠️  Warning: Skipping field with empty label"
      SECRETS_FAILED=$((SECRETS_FAILED + 1))
      continue
    fi

    if [ -z "${VALUE}" ]; then
      echo "⚠️  Warning: Skipping '${NAME}' (empty value)"
      SECRETS_FAILED=$((SECRETS_FAILED + 1))
      continue
    fi

    # Validate environment variable name (alphanumeric and underscore only)
    if ! echo "$NAME" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*$'; then
      echo "⚠️  Warning: Skipping '${NAME}' (invalid env var name)"
      SECRETS_FAILED=$((SECRETS_FAILED + 1))
      continue
    fi

    # Block dangerous variable names that could compromise the container
    DANGEROUS_VARS="PATH LD_PRELOAD IFS PS1 PS2 PS4 ENV BASH_ENV LD_LIBRARY_PATH"

    for dangerous in $DANGEROUS_VARS; do
      if [ "$NAME" = "$dangerous" ]; then
        echo "⚠️  Warning: Skipping '${NAME}' (reserved variable name)"
        SECRETS_FAILED=$((SECRETS_FAILED + 1))
        continue 2
      fi
    done

    # Export as environment variable
    export "$NAME"="$VALUE"
    SECRETS_LOADED=$((SECRETS_LOADED + 1))

    # Log success (without value for security)
    echo "   ✅ Loaded: ${NAME}"
  done < "$TEMP_FIELDS"

  rm -f "$TEMP_FIELDS"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "✅ 1Password secrets loaded successfully"
echo "   Total secrets loaded: ${SECRETS_LOADED}"

if [ "${SECRETS_FAILED}" -gt 0 ]; then
  echo "   ⚠️  Fields skipped: ${SECRETS_FAILED}"
fi

echo ""

return 0
