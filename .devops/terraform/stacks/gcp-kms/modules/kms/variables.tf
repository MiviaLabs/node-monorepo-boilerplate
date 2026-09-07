# ============================================================================
# GCP KMS Module - Input Variables
# ============================================================================

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "location" {
  description = "The location for the KMS Key Ring"
  type        = string
  default     = "global"
}

variable "key_ring_id" {
  description = "The ID of the KMS Key Ring"
  type        = string
}

variable "crypto_keys" {
  description = "Map of crypto keys to create. Key is the resource name, value is the configuration."
  type = map(object({
    key_id            = string
    rotation_period   = string
    algorithm         = string
    protection_level  = string
    destruction_delay = string
  }))
}

variable "labels" {
  description = "Labels to apply to KMS resources"
  type        = map(string)
  default     = {}
}

variable "create_service_account" {
  description = "Whether to create a service account for KMS access"
  type        = bool
  default     = true
}

variable "service_account_id" {
  description = "The service account ID"
  type        = string
  default     = "kms-accessor"
}

variable "service_account_display_name" {
  description = "The service account display name"
  type        = string
  default     = "KMS Accessor Service Account"
}

variable "service_account_description" {
  description = "The service account description"
  type        = string
  default     = "Service account for KMS access"
}

variable "encrypter_decrypter_members" {
  description = "IAM members to grant encrypt/decrypt access"
  type        = list(string)
  default     = []
}

variable "viewer_members" {
  description = "IAM members to grant viewer access"
  type        = list(string)
  default     = []
}

variable "admin_members" {
  description = "IAM members to grant admin access to the key ring"
  type        = list(string)
  default     = []
}
