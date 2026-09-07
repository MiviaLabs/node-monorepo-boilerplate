#!/usr/bin/env sh
set -eu

ACTIONLINT_VERSION="1.7.12"
ACTIONLINT_COMMIT="914e7df21a07ef503a81201c76d2b11c789d3fca"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

curl -sSfL "https://raw.githubusercontent.com/rhysd/actionlint/${ACTIONLINT_COMMIT}/scripts/download-actionlint.bash" \
  | bash -s -- "$ACTIONLINT_VERSION" "$TEMP_DIR"
"$TEMP_DIR/actionlint" .github/workflows/*.yml
