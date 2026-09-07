package authorization

import future.keywords.if

# Backward-compatible alias for deployments still querying
# /v1/data/authorization/allow.
default allow = false

allow if {
  data.authz.allow
}
