package authz

import future.keywords.if

test_allow_admin_bypass if {
  data.authz.allow with input as {"user": {"system_roles": ["system_admin"]}, "resource": {"type": "sensitive", "scope": "system"}, "action": "delete"}
}

test_allow_owner_bypass if {
  data.authz.allow with input as {"user": {"system_roles": ["system_owner"]}, "resource": {"type": "sensitive", "scope": "system"}, "action": "delete"}
}

test_deny_admin_bypass_for_tenant_scope_without_permission if {
  not data.authz.allow with input as {
    "user": {"system_roles": ["system_admin"]},
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-123"},
    "action": "read"
  }
}

test_deny_owner_bypass_for_tenant_scope_without_permission if {
  not data.authz.allow with input as {
    "user": {"system_roles": ["system_owner"]},
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-123"},
    "action": "read"
  }
}

test_allow_system_admin_delete_tenant_with_permission if {
  data.authz.allow with input as {
    "user": {"permissions": ["system:tenants:delete"]},
    "resource": {"type": "tenants", "scope": "system"},
    "action": "delete"
  }
}

test_allow_system_users_read_permission if {
  data.authz.allow with input as {
    "user": {"permissions": ["system:users:read"]},
    "resource": {"type": "users", "scope": "system"},
    "action": "read"
  }
}

test_allow_system_monitor_permission_for_dead_letter_list if {
  data.authz.allow with input as {
    "user": {"permissions": ["system:system:monitor"]},
    "resource": {"type": "dead_letter_events", "scope": "system"},
    "action": "list"
  }
}

test_allow_system_monitor_permission_for_system_monitor_read if {
  data.authz.allow with input as {
    "user": {"permissions": ["system:system:monitor"]},
    "resource": {"type": "system_monitor", "scope": "system"},
    "action": "read"
  }
}

test_allow_data_retention_permission_for_read if {
  data.authz.allow with input as {
    "user": {"permissions": ["system:data_retention:read"]},
    "resource": {"type": "data_retention", "scope": "system"},
    "action": "read"
  }
}

test_allow_system_settings_permission_for_event_replay_start if {
  data.authz.allow with input as {
    "user": {"permissions": ["system:system:settings"]},
    "resource": {"type": "event_replay", "scope": "system"},
    "action": "start"
  }
}

test_allow_with_permission if {
  data.authz.allow with input as {
    "user": {"permissions": ["system:tenants:read"]},
    "resource": {"type": "tenants", "scope": "system"},
    "action": "read"
  }
}

test_allow_with_backward_compatible_permission if {
  data.authz.allow with input as {
    "user": {"permissions": ["tenants:read"]},
    "resource": {"type": "tenants"},
    "action": "read"
  }
}

test_tenant_admin_can_update if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_admin"],
      "organization_id": "org-123",
      "permissions": ["tenant:users:update"]
    },
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-123"},
    "action": "update"
  }
}

test_tenant_admin_cannot_access_system_scope if {
  not data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_admin"],
      "organization_id": "org-123"
    },
    "resource": {"type": "system_settings", "scope": "system", "organization_id": "org-123"},
    "action": "read"
  }
}

test_tenant_user_can_read if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:users:read"]
    },
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-123"},
    "action": "read"
  }
}

test_tenant_user_can_read_self if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123"
    },
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-123"},
    "action": "read_self"
  }
}

test_tenant_user_can_update_self if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123"
    },
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-123"},
    "action": "update_self"
  }
}

test_tenant_user_cannot_update_self_across_tenants if {
  not data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123"
    },
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-999"},
    "action": "update_self"
  }
}

test_tenant_viewer_can_list if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_viewer"],
      "organization_id": "org-123",
      "permissions": ["tenant:users:read"]
    },
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-123"},
    "action": "list"
  }
}

test_tenant_viewer_cannot_create if {
  not data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_viewer"],
      "organization_id": "org-123"
    },
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-123"},
    "action": "create"
  }
}

test_tenant_user_can_update_own_project_with_update_permission if {
  data.authz.allow with input as {
    "user": {
      "id": "user-123",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:projects:update"]
    },
    "resource": {
      "type": "projects",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123"
    },
    "action": "update"
  }
}

test_tenant_user_cannot_delete_own_project_without_delete_permission if {
  not data.authz.allow with input as {
    "user": {
      "id": "user-123",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:projects:update"]
    },
    "resource": {
      "type": "projects",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123"
    },
    "action": "delete"
  }
}

test_tenant_user_can_delete_own_project_with_delete_permission if {
  data.authz.allow with input as {
    "user": {
      "id": "user-123",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:projects:delete"]
    },
    "resource": {
      "type": "projects",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123"
    },
    "action": "delete"
  }
}

test_tenant_user_can_read_private_project_when_assigned_member if {
  data.authz.allow with input as {
    "user": {
      "id": "user-456",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:projects:read"]
    },
    "resource": {
      "type": "projects",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123",
      "attributes": {
        "visibility": "private",
        "is_member": true
      }
    },
    "action": "read"
  }
}

test_tenant_content_read_permission_can_list_content_comments if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:read"]
    },
    "resource": {"type": "content_comments", "scope": "tenant", "organization_id": "org-123"},
    "action": "list"
  }
}

test_tenant_content_update_permission_can_create_content_comments if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:update"]
    },
    "resource": {"type": "content_comments", "scope": "tenant", "organization_id": "org-123"},
    "action": "create"
  }
}

test_tenant_content_delete_permission_can_delete_content_comments if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:update"]
    },
    "resource": {"type": "content_comments", "scope": "tenant", "organization_id": "org-123"},
    "action": "delete"
  }
}

test_tenant_content_read_permission_cannot_create_content_comments if {
  not data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:read"]
    },
    "resource": {"type": "content_comments", "scope": "tenant", "organization_id": "org-123"},
    "action": "create"
  }
}

test_system_admin_can_delete_content_comments_in_tenant_scope if {
  data.authz.allow with input as {
    "user": {
      "system_roles": ["system_admin"]
    },
    "resource": {"type": "content_comments", "scope": "tenant", "organization_id": "org-123"},
    "action": "delete"
  }
}

test_system_owner_can_delete_content_comments_in_tenant_scope if {
  data.authz.allow with input as {
    "user": {
      "system_roles": ["system_owner"]
    },
    "resource": {"type": "content_comments", "scope": "tenant", "organization_id": "org-123"},
    "action": "delete"
  }
}

test_tenant_user_cannot_read_private_project_when_not_assigned_member if {
  not data.authz.allow with input as {
    "user": {
      "id": "user-456",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:projects:read"]
    },
    "resource": {
      "type": "projects",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123",
      "attributes": {
        "visibility": "private",
        "is_member": false
      }
    },
    "action": "read"
  }
}

test_tenant_user_with_update_permission_can_manage_project_members_via_write_action if {
  data.authz.allow with input as {
    "user": {
      "id": "user-123",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:projects:update"]
    },
    "resource": {
      "type": "projects",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123"
    },
    "action": "write"
  }
}

test_tenant_user_can_update_own_issue_assignment_via_update_self if {
  data.authz.allow with input as {
    "user": {
      "id": "user-123",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:issues:read"]
    },
    "resource": {
      "type": "issues",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123"
    },
    "action": "update_self"
  }
}

test_tenant_user_with_issues_update_can_update_any_issue_assignment_via_update_self if {
  data.authz.allow with input as {
    "user": {
      "id": "user-456",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:issues:update"]
    },
    "resource": {
      "type": "issues",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123"
    },
    "action": "update_self"
  }
}

test_tenant_user_cannot_update_other_issue_assignment_without_issues_update if {
  not data.authz.allow with input as {
    "user": {
      "id": "user-456",
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:issues:read"]
    },
    "resource": {
      "type": "issues",
      "scope": "tenant",
      "organization_id": "org-123",
      "owner_id": "user-123"
    },
    "action": "update_self"
  }
}

test_tenant_user_can_decide_invitation_in_active_tenant if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123"
    },
    "resource": {
      "type": "invitations",
      "scope": "tenant",
      "organization_id": "org-123"
    },
    "action": "accept"
  }
}

test_tenant_user_cannot_decide_invitation_in_another_tenant if {
  not data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123"
    },
    "resource": {
      "type": "invitations",
      "scope": "tenant",
      "organization_id": "org-999"
    },
    "action": "decline"
  }
}

test_tenant_user_can_read_content_with_content_read_permission if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:read"]
    },
    "resource": {"type": "content", "scope": "tenant", "organization_id": "org-123"},
    "action": "read"
  }
}

test_tenant_user_cannot_read_content_across_tenants if {
  not data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:read"]
    },
    "resource": {"type": "content", "scope": "tenant", "organization_id": "org-999"},
    "action": "read"
  }
}

test_tenant_admin_can_create_content_with_content_create_permission if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_admin"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:create"]
    },
    "resource": {"type": "content", "scope": "tenant", "organization_id": "org-123"},
    "action": "create"
  }
}

test_tenant_user_cannot_update_content_without_content_update_permission if {
  not data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_user"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:read"]
    },
    "resource": {"type": "content", "scope": "tenant", "organization_id": "org-123"},
    "action": "update"
  }
}

test_tenant_owner_can_delete_content_with_content_delete_permission if {
  data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_owner"],
      "organization_id": "org-123",
      "permissions": ["tenant:content:delete"]
    },
    "resource": {"type": "content", "scope": "tenant", "organization_id": "org-123"},
    "action": "delete"
  }
}

test_deny_cross_tenant_access if {
  not data.authz.allow with input as {
    "user": {
      "tenant_roles": ["tenant_admin"],
      "organization_id": "org-123"
    },
    "resource": {"type": "users", "scope": "tenant", "organization_id": "org-456"},
    "action": "read"
  }
}

test_deny_default if {
  not data.authz.allow with input as {"user": {}, "resource": {"type": "sensitive"}, "action": "delete"}
}
