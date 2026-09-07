# ============================================================================
# GCP KMS Infrastructure - Input Variables
# ============================================================================
# These variables control the configuration of your GCP KMS infrastructure.
# Define these in a terraform.tfvars file or pass them at runtime.
# ============================================================================

variable "project_id" {
  description = "The GCP project ID where KMS resources will be created"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must be 6-30 characters, lowercase letters, digits, or hyphens, starting with a letter and ending with a letter or digit."
  }
}

variable "location" {
  description = "The location for the KMS Key Ring. Use 'global' for multi-region or specific regions like 'us-east1', 'europe-west1'"
  type        = string
  default     = "global"

  validation {
    condition     = can(regex("^(global|[a-z]{2}-[a-z]+[0-9])$", var.location))
    error_message = "Location must be 'global' or a valid GCP region (e.g., 'us-east1', 'europe-west1')."
  }
}

variable "region" {
  description = "The default region for GCP provider resources"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The default zone for GCP provider resources"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment label for resource organization (e.g., 'dev', 'staging', 'prod')"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "key_ring_id" {
  description = "Unique identifier for the KMS Key Ring"
  type        = string
  default     = "app-encryption-keys"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,61}[a-z0-9]$", var.key_ring_id))
    error_message = "Key Ring ID must be 1-63 characters, lowercase letters, digits, or hyphens, starting with a letter and ending with a letter or digit."
  }
}

variable "key_id" {
  description = "Unique identifier for the KMS Crypto Key"
  type        = string
  default     = "primary-encryption-key"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_-]{1,61}[a-z0-9]$", var.key_id))
    error_message = "Key ID must be 1-63 characters, lowercase letters, digits, underscores, or hyphens, starting with a letter and ending with a letter or digit."
  }
}


variable "service_account_id" {
  description = "Service account ID for KMS access (without @project_id.iam.gserviceaccount.com suffix)"
  type        = string
  default     = "kms-accessor-sa"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{5,29}[a-z0-9]$", var.service_account_id))
    error_message = "Service account ID must be 6-30 characters, lowercase letters, digits, or hyphens, starting with a letter and ending with a letter or digit."
  }
}

variable "rotation_period" {
  description = "Period for automatic key rotation (e.g., '7776000s' for 90 days)"
  type        = string
  default     = "7776000s" # 90 days

  validation {
    condition     = can(regex("^[0-9]+s$", var.rotation_period))
    error_message = "Rotation period must be a duration in seconds ending with 's' (e.g., '7776000s')."
  }
}

variable "key_destruction_delay" {
  description = "Delay before key version destruction in seconds (e.g., '86400s' for 24 hours). Cannot be changed after key creation. NOTE: GCP KMS destroy_scheduled_duration only accepts seconds format."
  type        = string
  default     = "86400s" # 24 hours

  validation {
    condition     = can(regex("^[0-9]+s$", var.key_destruction_delay))
    error_message = "Key destruction delay must be a duration in seconds ending with 's' (e.g., '86400s' for 24 hours)."
  }
}

variable "encryption_algorithm" {
  description = "Encryption algorithm to use for the crypto key"
  type        = string
  default     = "GOOGLE_SYMMETRIC_ENCRYPTION"

  validation {
    condition     = contains(["GOOGLE_SYMMETRIC_ENCRYPTION", "AES256_GCM"], var.encryption_algorithm)
    error_message = "Encryption algorithm must be one of: GOOGLE_SYMMETRIC_ENCRYPTION, AES256_GCM."
  }
}

variable "protection_level" {
  description = "Protection level for the crypto key"
  type        = string
  default     = "SOFTWARE"

  validation {
    condition     = contains(["SOFTWARE", "HSM"], var.protection_level)
    error_message = "Protection level must be one of: SOFTWARE, HSM."
  }
}

variable "create_service_account_key" {
  description = "Create a service account key (private key). WARNING: This is a security risk. Prefer Workload Identity for GKE/GCE."
  type        = bool
  default     = false
}

variable "additional_iam_members" {
  description = "Additional IAM members to grant encrypt/decrypt access (e.g., ['user:admin@example.com', 'serviceAccount:another-sa@project.iam.gserviceaccount.com'])"
  type        = list(string)
  default     = []
}

variable "admin_iam_members" {
  description = "IAM members to grant admin access to the key ring (e.g., ['user:admin@example.com'])"
  type        = list(string)
  default     = []
}
