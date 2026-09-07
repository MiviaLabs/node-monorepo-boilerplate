#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---check}"
OPA_VERSION="${OPA_VERSION:-v0.64.1}"

print_install_help() {
  cat <<'EOF'
OPA CLI is required for local Rego validation.

Install options:
  macOS (Homebrew):
    brew install opa

  Linux (manual):
    curl -L -o /tmp/opa "https://openpolicyagent.org/downloads/v0.64.1/opa_linux_amd64_static"
    chmod +x /tmp/opa
    sudo mv /tmp/opa /usr/local/bin/opa

Then verify:
  opa version
EOF
}

check_opa() {
  if command -v opa >/dev/null 2>&1; then
    local version_output version_line
    version_output="$(opa version)"
    version_line="${version_output%%$'\n'*}"
    echo "OPA CLI detected: ${version_line}"
    if ! echo "${version_line}" | grep -q "${OPA_VERSION#v}"; then
      echo "Warning: expected OPA ${OPA_VERSION} for this repo's Rego syntax compatibility."
    fi
    return 0
  fi

  echo "OPA CLI not found in PATH."
  print_install_help
  return 1
}

has_expected_version() {
  if ! command -v opa >/dev/null 2>&1; then
    return 1
  fi

  local version_line
  version_line="$(opa version | head -n1)"
  echo "${version_line}" | grep -q "${OPA_VERSION#v}"
}

download_opa_asset_name() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "${os}:${arch}" in
    linux:x86_64) echo "opa_linux_amd64_static" ;;
    linux:aarch64|linux:arm64) echo "opa_linux_arm64_static" ;;
    darwin:x86_64) echo "opa_darwin_amd64_static" ;;
    darwin:arm64) echo "opa_darwin_arm64_static" ;;
    *)
      return 1
      ;;
  esac
}

install_release_binary() {
  local asset
  asset="$(download_opa_asset_name)" || {
    echo "Unsupported platform for auto-install. Please install OPA ${OPA_VERSION} manually."
    return 1
  }

  local download_url
  download_url="https://openpolicyagent.org/downloads/${OPA_VERSION}/${asset}"
  echo "Installing pinned OPA release ${OPA_VERSION} from ${download_url}..."
  curl -L -o /tmp/opa "${download_url}"
  chmod +x /tmp/opa

  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo mv /tmp/opa /usr/local/bin/opa
  else
    mkdir -p "${HOME}/.local/bin"
    mv /tmp/opa "${HOME}/.local/bin/opa"
    chmod +x "${HOME}/.local/bin/opa"
  fi
}

install_opa() {
  if command -v opa >/dev/null 2>&1; then
    local installed_output installed
    installed_output="$(opa version)"
    installed="${installed_output%%$'\n'*}"
    if echo "${installed}" | grep -q "${OPA_VERSION#v}"; then
      echo "OPA CLI already installed: ${installed}"
      return 0
    fi
    echo "OPA CLI version mismatch (${installed}). Reinstalling ${OPA_VERSION}..."
  fi

  if command -v brew >/dev/null 2>&1; then
    echo "Installing OPA with Homebrew..."
    brew install opa

    if has_expected_version; then
      check_opa
      return 0
    fi

    echo "Homebrew installed a different version. Installing pinned ${OPA_VERSION} binary."
    install_release_binary
    check_opa
    return 0
  fi

  if command -v curl >/dev/null 2>&1; then
    install_release_binary
    check_opa
    return 0
  fi

  echo "Unable to auto-install OPA: neither brew nor curl is available."
  print_install_help
  return 1
}

case "$MODE" in
  --check)
    check_opa
    ;;
  --install)
    install_opa
    ;;
  *)
    echo "Usage: $0 [--check|--install]"
    exit 2
    ;;
esac
