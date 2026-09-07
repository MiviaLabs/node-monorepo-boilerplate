# ============================================================================
# GCP Storage Infrastructure - Input Variables
# ============================================================================

variable "project_id" {
  description = "The GCP project ID where storage resources will be created"
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

variable "default_instance" {
  description = "The storage instance the application should treat as the default"
  type        = string
  default     = "uploads"

  validation {
    condition     = length(trimspace(var.default_instance)) > 0
    error_message = "default_instance must not be empty."
  }
}

variable "storage_instances" {
  description = "Named storage instances to provision for the application"
  type = map(object({
    bucket_name                      = string
    bucket_location                  = optional(string, "US")
    storage_class                    = optional(string, "STANDARD")
    enable_versioning                = optional(bool, true)
    lifecycle_delete_age_days        = optional(number, 0)
    force_destroy                    = optional(bool, false)
    cors_origins                     = optional(list(string), [])
    cors_methods                     = optional(list(string), ["GET", "HEAD", "PUT", "POST"])
    cors_response_headers            = optional(list(string), ["Content-Type", "Authorization"])
    cors_max_age_seconds             = optional(number, 3600)
    service_account_id               = string
    create_hmac_key                  = optional(bool, true)
    additional_object_admin_members  = optional(list(string), [])
    additional_object_viewer_members = optional(list(string), [])
    admin_iam_members                = optional(list(string), [])
  }))

  validation {
    condition     = length(var.storage_instances) > 0
    error_message = "storage_instances must define at least one named storage instance."
  }

  validation {
    condition     = contains(keys(var.storage_instances), var.default_instance)
    error_message = "default_instance must match one of the keys in storage_instances."
  }

  validation {
    condition = alltrue([
      for instance_name, config in var.storage_instances :
      can(regex("^[a-z][a-z0-9-]{1,30}[a-z0-9]$", instance_name))
    ])
    error_message = "Each storage instance key must be lowercase alphanumeric with optional internal hyphens."
  }

  validation {
    condition = alltrue([
      for _, config in var.storage_instances :
      can(regex("^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", config.bucket_name))
    ])
    error_message = "Each bucket_name must be 3-63 characters, lowercase letters, digits, dots, underscores, or hyphens, starting and ending with a letter or digit."
  }

  validation {
    condition = alltrue([
      for _, config in var.storage_instances :
      contains(["STANDARD", "NEARLINE", "COLDLINE", "ARCHIVE"], config.storage_class)
    ])
    error_message = "Each storage_class must be one of: STANDARD, NEARLINE, COLDLINE, ARCHIVE."
  }

  validation {
    condition = alltrue([
      for _, config in var.storage_instances :
      can(regex("^[a-z][a-z0-9-]{5,29}[a-z0-9]$", config.service_account_id))
    ])
    error_message = "Each service_account_id must be 6-30 characters, lowercase letters, digits, or hyphens, starting with a letter and ending with a letter or digit."
  }
}
