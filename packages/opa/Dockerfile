# Dockerfile for OPA Server on Railway.app
FROM alpine:3.19

# Install CA certificates and curl
RUN apk add --no-cache ca-certificates curl

# Create non-root runtime user
RUN addgroup -S opa && adduser -S -G opa opa

# Download OPA binary directly from GitHub releases
RUN curl -L -o /opa https://github.com/open-policy-agent/opa/releases/download/v0.64.1/opa_linux_amd64_static && \
    chmod +x /opa

# Verify OPA binary was downloaded and list files for debugging
RUN ls -la /opa && /opa version

# Copy canonical authorization policies (same source as local/dev compose)
COPY packages/opa/policies/authz/ /policies/

# Copy entrypoint script that handles PORT expansion (relative to repo root)
COPY packages/opa/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R opa:opa /opa /policies /entrypoint.sh

# Run as non-root user
USER opa

# Railway sets the PORT environment variable dynamically
# Expose the default OPA port
EXPOSE 8181

# Container health check for OPA server readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "curl -fsS http://127.0.0.1:${PORT:-8181}/health >/dev/null || exit 1"]

# Run OPA in server mode using entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
