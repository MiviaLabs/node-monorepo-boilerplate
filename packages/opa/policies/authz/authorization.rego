package authz

import future.keywords.contains
import future.keywords.if
import future.keywords.in

# Default deny all access
default allow = false

# Helper function to parse scope:resource:action format
parse_permission(perm) := [scope, resource, action] if {
  parts := split(perm, ":")
  count(parts) == 3
  scope := parts[0]
  resource := parts[1]
  action := parts[2]
}

# Generic permission match for exact scope/resource/action permission strings.
allow if {
  perm := input.user.permissions[_]
  [scope, resource, action] := parse_permission(perm)
  resource_scope := object.get(input.resource, "scope", "tenant")
  scope == resource_scope
  resource_matches(scope, resource)
  action_matches(action)
  scope_authorized(scope)
  not project_owner_check_required
  not project_private_read_check_required
}

# Allow if user has required permission in resource:action format (backward compatibility)
allow if {
  perm := input.user.permissions[_]
  [resource, action] := split(perm, ":")
  count(split(perm, ":")) == 2
  resource_scope := object.get(input.resource, "scope", "")
  resource == input.resource.type
  action == input.action
  legacy_scope_authorized(resource_scope)
  not project_owner_check_required
  not project_private_read_check_required
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "projects"
  input.action in ["read", "list"]
  "tenant:projects:read" in input.user.permissions
  scope_authorized("tenant")
  project_read_allowed
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "projects"
  input.action in ["write", "update", "delete"]
  input.user.id == input.resource.owner_id
  "tenant_user" in input.user.tenant_roles
  has_project_mutation_permission
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content"
  input.action in ["read", "list"]
  "tenant:content:read" in input.user.permissions
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content"
  input.action == "create"
  "tenant:content:create" in input.user.permissions
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content"
  input.action in ["write", "update"]
  "tenant:content:update" in input.user.permissions
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content"
  input.action == "delete"
  "tenant:content:delete" in input.user.permissions
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content_comments"
  input.action in ["read", "list"]
  "tenant:content:read" in input.user.permissions
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content_comments"
  input.action == "create"
  "tenant:content:update" in input.user.permissions
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content_comments"
  input.action == "delete"
  "tenant:content:update" in input.user.permissions
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content_comments"
  input.action == "delete"
  "system_admin" in input.user.system_roles
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "content_comments"
  input.action == "delete"
  "system_owner" in input.user.system_roles
}

# Phase 1 admin routes intentionally reuse the existing system permission model.
# Health, statistics, and inbox overviews use system monitor permissions, while
# tenant and access inventories continue to use the existing tenants/users reads.
# Monitor/settings fan-out remains explicit here for the operational resources
# that do not map 1:1 to the permission resource segment.
allow if {
  "system:system:monitor" in input.user.permissions
  input.resource.scope == "system"
  input.resource.type in ["system_monitor", "dead_letter_events", "event_replay"]
  input.action in ["read", "list"]
}

allow if {
  "system:data_retention:read" in input.user.permissions
  input.resource.scope == "system"
  input.resource.type == "data_retention"
  input.action in ["read", "list"]
}

allow if {
  "system:system:settings" in input.user.permissions
  input.resource.scope == "system"
  input.resource.type in ["system_settings", "dead_letter_events", "event_replay"]
  input.action in ["read", "write", "start", "cancel", "replay", "delete"]
}

# Tenant permission aliases for controller/resource metadata that does not map
# 1:1 to the stored permission namespace yet.
allow if {
  "tenant:settings:update" in input.user.permissions
  input.resource.scope == "tenant"
  input.resource.type == "organizations"
  input.action in ["read", "write"]
  scope_authorized("tenant")
}

allow if {
  "tenant:users:update" in input.user.permissions
  input.resource.scope == "tenant"
  input.resource.type == "users"
  input.action in ["assign_role", "update_status"]
  scope_authorized("tenant")
}

allow if {
  "tenant:users:update" in input.user.permissions
  input.resource.scope == "tenant"
  input.resource.type == "invitations"
  input.action == "revoke"
  scope_authorized("tenant")
}

allow if {
  "tenant:users:create" in input.user.permissions
  input.resource.scope == "tenant"
  input.resource.type == "users"
  input.action == "invite"
  scope_authorized("tenant")
}

allow if {
  "tenant:users:create" in input.user.permissions
  input.resource.scope == "tenant"
  input.resource.type == "invitations"
  input.action == "generate_link"
  scope_authorized("tenant")
}

# Invitation recipients may decide on invitations in their active tenant.
# Token validity and invited-email matching remain enforced by the command
# handlers; OPA only provides the authenticated tenant boundary here.
allow if {
  input.resource.scope == "tenant"
  input.resource.type == "invitations"
  input.action in ["accept", "decline"]
  input.user.tenant_roles[_] in ["tenant_admin", "tenant_owner", "tenant_user", "tenant_viewer"]
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "issues"
  input.action == "update_self"
  input.user.id == input.resource.owner_id
  scope_authorized("tenant")
}

allow if {
  input.resource.scope == "tenant"
  input.resource.type == "issues"
  input.action == "update_self"
  "tenant:issues:update" in input.user.permissions
  scope_authorized("tenant")
}

allow if {
  "tenant:crypto:key_rotate" in input.user.permissions
  input.resource.scope == "tenant"
  input.resource.type in ["users", "encrypted_store"]
  input.action in ["rotate_key", "cancel"]
  scope_authorized("tenant")
}

# System admin bypass for system-scoped resources only.
allow if {
  "system_admin" in input.user.system_roles
  input.resource.scope == "system"
}

# System owner bypass for system-scoped resources only.
allow if {
  "system_owner" in input.user.system_roles
  input.resource.scope == "system"
}

# Tenant roles can always self-read within their organization.
allow if {
  input.resource.scope == "tenant"
  "tenant_admin" in input.user.tenant_roles
  input.action == "read_self"
  input.user.organization_id == input.resource.organization_id
}

allow if {
  input.resource.scope == "tenant"
  "tenant_owner" in input.user.tenant_roles
  input.action == "read_self"
  input.user.organization_id == input.resource.organization_id
}

allow if {
  input.resource.scope == "tenant"
  "tenant_user" in input.user.tenant_roles
  input.action == "read_self"
  input.user.organization_id == input.resource.organization_id
}

allow if {
  input.resource.scope == "tenant"
  "tenant_viewer" in input.user.tenant_roles
  input.action == "read_self"
  input.user.organization_id == input.resource.organization_id
}

# Tenant roles can always self-update within their organization.
allow if {
  input.resource.scope == "tenant"
  "tenant_admin" in input.user.tenant_roles
  input.resource.type == "users"
  input.action == "update_self"
  input.user.organization_id == input.resource.organization_id
}

allow if {
  input.resource.scope == "tenant"
  "tenant_owner" in input.user.tenant_roles
  input.resource.type == "users"
  input.action == "update_self"
  input.user.organization_id == input.resource.organization_id
}

allow if {
  input.resource.scope == "tenant"
  "tenant_user" in input.user.tenant_roles
  input.resource.type == "users"
  input.action == "update_self"
  input.user.organization_id == input.resource.organization_id
}

allow if {
  input.resource.scope == "tenant"
  "tenant_viewer" in input.user.tenant_roles
  input.resource.type == "users"
  input.action == "update_self"
  input.user.organization_id == input.resource.organization_id
}

scope_authorized("system")

scope_authorized("tenant") if {
  input.user.organization_id == input.resource.organization_id
}

legacy_scope_authorized("") if {
  true
}

legacy_scope_authorized(scope) if {
  scope != ""
  scope_authorized(scope)
}

resource_matches(scope, resource) if {
  resource == input.resource.type
  scope == object.get(input.resource, "scope", "tenant")
}

action_matches(action) if {
  action == input.action
}

action_matches("update") if {
  input.action == "write"
}

action_matches("write") if {
  input.action == "update"
}

action_matches("read") if {
  input.action == "read_self"
}

action_matches("read") if {
  input.action == "list"
}

project_read_allowed if {
  input.action == "list"
}

project_read_allowed if {
  input.resource.attributes.visibility == "public"
}

project_read_allowed if {
  input.resource.attributes.visibility == "private"
  input.user.id == input.resource.owner_id
}

project_read_allowed if {
  input.resource.attributes.visibility == "private"
  input.resource.attributes.is_member == true
}

project_read_allowed if {
  input.resource.attributes.visibility == "private"
  admin_project_access
}

has_project_mutation_permission if {
  input.action in ["write", "update"]
  "tenant:projects:update" in input.user.permissions
}

has_project_mutation_permission if {
  input.action == "delete"
  "tenant:projects:delete" in input.user.permissions
}

project_owner_check_required if {
  input.resource.type == "projects"
  input.action in ["write", "update", "delete"]
  "tenant_user" in input.user.tenant_roles
  not admin_project_access
}

project_private_read_check_required if {
  input.resource.type == "projects"
  input.action == "read"
  input.resource.attributes.visibility == "private"
  not admin_project_access
}

admin_project_access if {
  input.user.tenant_roles[_] in ["tenant_owner", "tenant_admin"]
}
