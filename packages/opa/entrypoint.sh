#!/bin/sh
# Entrypoint script for OPA Server on Railway.app
# This script handles environment variable expansion for PORT

# Use PORT from environment, default to 8181
PORT=${PORT:-8181}

# Run OPA with the specified port
# The /opa binary is the ENTRYPOINT of the base image
exec /opa run --server --addr=0.0.0.0:${PORT} /policies
