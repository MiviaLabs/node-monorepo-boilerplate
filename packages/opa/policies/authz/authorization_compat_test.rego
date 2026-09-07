package authorization

import future.keywords.if

test_allow_alias_matches_authz_for_system_monitor_read if {
  data.authorization.allow with input as {
    "user": {"permissions": ["system:system:monitor"]},
    "resource": {"type": "system_monitor", "scope": "system"},
    "action": "read"
  }
}

test_deny_alias_matches_authz_default_deny if {
  not data.authorization.allow with input as {
    "user": {},
    "resource": {"type": "system_monitor", "scope": "system"},
    "action": "read"
  }
}
