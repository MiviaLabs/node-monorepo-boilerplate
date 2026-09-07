package tenant

import future.keywords.if

test_allow_same_tenant if {
  data.tenant.allow with input as {
    "user": {"organization_id": "org-123"},
    "resource": {"organization_id": "org-123"}
  }
}

test_deny_cross_tenant if {
  not data.tenant.allow with input as {
    "user": {"organization_id": "org-123"},
    "resource": {"organization_id": "org-456"}
  }
}

test_allow_system_admin_any_tenant if {
  data.tenant.allow with input as {
    "user": {
      "organization_id": "org-system",
      "system_roles": ["system_admin"]
    },
    "resource": {"organization_id": "org-456"}
  }
}

test_allow_system_owner_any_tenant if {
  data.tenant.allow with input as {
    "user": {
      "organization_id": "org-system",
      "system_roles": ["system_owner"]
    },
    "resource": {"organization_id": "org-456"}
  }
}
