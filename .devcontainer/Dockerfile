# Dev Container Dockerfile for GitHub Codespaces and Ona
# Node.js 24 + Python 3 + development tools
# Optimized for monorepo with pnpm, NestJS, React, TypeScript

FROM node:24-bookworm

# ============================================================================
# SYSTEM DEPENDENCIES
# ============================================================================
# Install system tools, Python 3, and database clients
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Version control and utilities
    git \
    curl \
    wget \
    jq \
    unzip \
    # Python 3 for tooling (Semgrep, pre-commit hooks)
    python3 \
    python3-pip \
    python3-venv \
    pipx \
    # Database clients
    postgresql-client \
    redis-tools \
    # Shell script linting
    shellcheck \
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# PYTHON TOOLS
# ============================================================================
# Configure pipx and install Python-based security/static analysis tools
ENV PIPX_HOME=/opt/pipx
ENV PIPX_BIN_DIR=/usr/local/bin
RUN pipx ensurepath && \
    # Semgrep for security scanning (local development)
    pipx install semgrep==1.102.0 && \
    # Checkov for Infrastructure-as-Code scanning
    pipx install checkov && \
    # TruffleHog for secret scanning
    pipx install truffleHog3

# ============================================================================
# STATIC ANALYSIS TOOLS
# ============================================================================
# Install additional linters and validators

# Actionlint (GitHub Actions workflow validator)
RUN ACTIONLINT_VERSION=1.7.4 && \
    wget -q https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz && \
    tar -xzf actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz actionlint && \
    mv actionlint /usr/local/bin/ && \
    chmod +x /usr/local/bin/actionlint && \
    rm actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz

# Hadolint (Dockerfile linter)
RUN HADOLINT_VERSION=2.12.0 && \
    wget -q https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-Linux-x86_64 -O /usr/local/bin/hadolint && \
    chmod +x /usr/local/bin/hadolint

# OPA (Open Policy Agent) for Rego policy validation
RUN OPA_VERSION=0.64.1 && \
    wget -q https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_linux_amd64_static -O /usr/local/bin/opa && \
    chmod +x /usr/local/bin/opa

# ============================================================================
# AI-POWERED DEVELOPMENT TOOLS
# ============================================================================

# CodeQL CLI (for security analysis)
# Download from: https://github.com/github/codeql-action/releases
RUN CODEQL_VERSION=2.20.4 && \
    wget -q https://github.com/github/codeql-action/releases/download/codeql-bundle-v${CODEQL_VERSION}/codeql-bundle-linux64.tar.gz && \
    tar -xzf codeql-bundle-linux64.tar.gz -C /opt && \
    rm codeql-bundle-linux64.tar.gz && \
    chmod +x /opt/codeql/codeql && \
    ln -s /opt/codeql/codeql /usr/local/bin/codeql

# ============================================================================
# PNPM CONFIGURATION
# ============================================================================
# Install pnpm with explicit version pin and configure caching
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# Set pnpm environment variables
ENV PNPM_HOME="/home/node/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

# Create pnpm global bin directory
RUN mkdir -p /home/node/.local/share/pnpm && \
    chown -R node:node /home/node/.local/share

# ============================================================================
# WORKSPACE SETUP
# ============================================================================
# Create workspace directory and set permissions
WORKDIR /workspace
RUN chown -R node:node /workspace

# ============================================================================
# USER CONFIGURATION
# ============================================================================
# Switch to non-root user for security
USER node

# Configure git defaults (will be overwritten by Codespaces/Ona)
RUN git config --global init.defaultBranch main && \
    git config --global pull.rebase false

# Install Claude Code CLI as node user (native binary)
# Documentation: https://code.claude.com/docs/en/setup
RUN curl -fsSL https://claude.ai/install.sh | bash

# ============================================================================
# VERIFICATION
# ============================================================================
# Verify installations (build-time check)
RUN node --version && \
    pnpm --version && \
    python3 --version && \
    semgrep --version && \
    actionlint --version && \
    hadolint --version && \
    opa version && \
    shellcheck --version && \
    codeql --version && \
    claude --version

# ============================================================================
# CONTAINER RUNTIME
# ============================================================================
# Keep container running
CMD ["sleep", "infinity"]
