#!/bin/bash
#
# categorize-comment.sh - Categorize PR review comments by issue type
#
# Reads comment text from stdin and outputs a category:
# - valid_p0: Critical security/data integrity issue
# - valid_p1: High priority quality/performance issue
# - valid_p2: Code style/consistency issue
# - false_positive: Incorrect finding, dispute needed
# - needs_review: Requires human judgment
#
# Usage: echo "$comment_body" | categorize-comment.sh
#

set -euo pipefail

# Read the comment from stdin
comment_body=$(cat)

# Define patterns for each category

# P0: Security, multi-tenancy, PII, secrets, data integrity
p0_patterns=(
  "multi-tenan"
  "tenant.*scop"
  "organizationId.*missing"
  "cross-tenant"
  "PII"
  "personal.*information"
  "email.*log"
  "password.*log"
  "secret.*expos"
  "API.*key.*hardcode"
  "SQL.*injection"
  "XSS"
  "CSRF"
  "Class-C.*data"
  "confidential.*data"
  "data.*integrity"
  "foreign.*key.*violat"
  "safe.*DELETE"
  "cascade.*delete"
  "unauthorized.*access"
  "authentication.*bypass"
  "authorization.*missing"
)

# P1: Quality, performance, TDD, test coverage, reliability
p1_patterns=(
  "N+1.*query"
  "missing.*index"
  "no.*test"
  "test.*coverage"
  "TDD"
  "Red-Green-Refactor"
  "no.*error.*handling"
  "retry.*logic"
  "circuit.*breaker"
  "performance.*issue"
  "memory.*leak"
  "race.*condition"
  "timeout"
  "graceful.*degrad"
  "fallback"
  "JSDoc.*missing.*public"
  "documentation.*missing.*export"
)

# P2: Style, naming, conventions, consistency
p2_patterns=(
  "naming.*convention"
  "camelCase"
  "PascalCase"
  "SCREAMING_SNAKE"
  "import.*order"
  "conventional.*commit"
  "magic.*literal"
  "code.*style"
  "formatting"
  "unused.*variable"
  "prefer.*const"
  "inline.*comment"
)

# False positive indicators
fp_patterns=(
  "any-ok"
  "intentional"
  "by design"
  "console-ok"
  "ignore"
  "not.*issue"
  "false.*positive"
  "working as intended"
  "expected behavior"
  "this is correct"
)

# Needs human review indicators
review_patterns=(
  "consider"
  "suggest"
  "prefer"
  "could.*be"
  "might.*want"
  "what if"
  "alternativ"
  "opinion"
  "question"
)

# Function to check if any pattern matches
check_patterns() {
  local text="$1"
  shift
  local patterns=("$@")

  for pattern in "${patterns[@]}"; do
    if echo "$text" | grep -qiE "$pattern"; then
      return 0  # Match found
    fi
  done
  return 1  # No match
}

# Convert to lowercase for matching
comment_lower=$(echo "$comment_body" | tr '[:upper:]' '[:lower:]')

# Check in priority order: FP > P0 > P1 > P2 > Review

# 1. Check for false positive markers first
if check_patterns "$comment_lower" "${fp_patterns[@]}"; then
  echo "false_positive"
  exit 0
fi

# 2. Check for P0 security/critical issues
if check_patterns "$comment_lower" "${p0_patterns[@]}"; then
  echo "valid_p0"
  exit 0
fi

# 3. Check for P1 quality/performance issues
if check_patterns "$comment_lower" "${p1_patterns[@]}"; then
  echo "valid_p1"
  exit 0
fi

# 4. Check for P2 style issues
if check_patterns "$comment_lower" "${p2_patterns[@]}"; then
  echo "valid_p2"
  exit 0
fi

# 5. Check for suggestions/opinions (needs review)
if check_patterns "$comment_lower" "${review_patterns[@]}"; then
  echo "needs_review"
  exit 0
fi

# Default: needs human review if no patterns matched
echo "needs_review"
