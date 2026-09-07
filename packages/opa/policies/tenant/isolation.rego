package tenant

import future.keywords.if
import future.keywords.in

# Ensure tenant isolation - users can only access their own tenant data
default allow = false

allow if {
  # Request tenant ID matches user's organization ID
  input.user.organization_id == input.resource.organization_id
}

# System admins can access any tenant
allow if {
  "system_admin" in input.user.system_roles
}

# System owners can access any tenant
allow if {
  "system_owner" in input.user.system_roles
}
