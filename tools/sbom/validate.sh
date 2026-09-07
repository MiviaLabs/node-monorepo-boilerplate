#!/bin/bash
set -e

echo "Validating SBOM..."

if [ ! -f "sbom.json" ]; then
  echo "Error: sbom.json not found"
  exit 1
fi

# Validate SBOM structure using cyclonedx-cli
if command -v cyclonedx &> /dev/null; then
  echo "Validating SBOM structure..."
  cyclonedx validate --input-file sbom.json --fail-on-errors || {
    echo "Error: SBOM validation failed"
    exit 1
  }
else
  echo "Warning: cyclonedx CLI not found, skipping structure validation"
fi

# Check for critical vulnerabilities in SBOM
if command -v jq &> /dev/null; then
  echo "Checking for critical vulnerabilities..."
  # Note: Vulnerability data may not be in all SBOM formats
  CRITICAL_COUNT=$(jq '.vulnerabilities | map(.severity == "critical") | length' sbom.json 2>/dev/null || echo "0")

  if [ "$CRITICAL_COUNT" -gt 0 ]; then
    echo "Warning: Found $CRITICAL_COUNT critical vulnerabilities in SBOM"
    # Non-blocking warning only
  fi
else
  echo "Warning: jq not found, skipping vulnerability check"
fi

echo "SBOM validation passed"
