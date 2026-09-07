# ============================================================================
# GCP Identity Platform Infrastructure - Input Variables
# ============================================================================

variable "project_id" {
  description = "The GCP project ID where Identity Platform resources will be created"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must be 6-30 characters, lowercase letters, digits, or hyphens, starting with a letter and ending with a letter or digit."
  }
}

variable "region" {
  description = "Default region for provider operations"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "Default zone for provider operations"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment label for resource organization"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "firebase_admin_service_account_id" {
  description = "Service account ID for Firebase Admin SDK access"
  type        = string
  default     = "firebase-adminsdk"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{5,29}[a-z0-9]$", var.firebase_admin_service_account_id))
    error_message = "Service account ID must be 6-30 characters, lowercase letters, digits, or hyphens, starting with a letter and ending with a letter or digit."
  }
}

variable "create_service_account_key" {
  description = "Create a service account key for non-GCP runtimes. Prefer ADC or Workload Identity when possible."
  type        = bool
  default     = false
}

variable "create_api_key" {
  description = "Create an API key for client-side Identity Platform usage"
  type        = bool
  default     = true
}

variable "api_key_display_name" {
  description = "Display name and Terraform resource name seed for the Identity Platform API key"
  type        = string
  default     = "identity-platform-web-key"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,62}$", var.api_key_display_name))
    error_message = "api_key_display_name must be 3-63 characters, lowercase letters, digits, or hyphens, starting with a letter."
  }
}

variable "authorized_domains" {
  description = "Authorized domains for Identity Platform redirects and hosted flows"
  type        = list(string)
  default     = ["localhost"]
}

variable "allow_duplicate_emails" {
  description = "Whether to allow multiple accounts with the same email"
  type        = bool
  default     = false
}

variable "enable_anonymous_users" {
  description = "Whether anonymous sign-in should be enabled"
  type        = bool
  default     = false
}

variable "enable_email_password" {
  description = "Whether email sign-in should be enabled"
  type        = bool
  default     = true
}

variable "password_required" {
  description = "Whether email sign-in requires a password instead of allowing email-link-only auth"
  type        = bool
  default     = true
}

variable "disable_user_signup" {
  description = "When true, end users cannot self-register through Identity Platform APIs"
  type        = bool
  default     = false
}

variable "disable_user_deletion" {
  description = "When true, end users cannot self-delete through Identity Platform APIs"
  type        = bool
  default     = false
}

variable "enable_multi_tenant" {
  description = "Whether to allow tenant creation in the Identity Platform project config"
  type        = bool
  default     = true
}

variable "create_default_tenant" {
  description = "Create a default tenant for multi-tenant Identity Platform setups"
  type        = bool
  default     = false
}

variable "tenant_display_name" {
  description = "Display name for the default tenant when create_default_tenant is true"
  type        = string
  default     = "starter-kit-default-tenant"
}

variable "allow_password_signup" {
  description = "Whether password signup is allowed for the default tenant"
  type        = bool
  default     = true
}

variable "enable_email_link_signin" {
  description = "Whether email-link sign-in is enabled for the default tenant"
  type        = bool
  default     = false
}

variable "additional_admin_members" {
  description = "Additional IAM members that should manage Firebase Authentication resources"
  type        = list(string)
  default     = []
}
