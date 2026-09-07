# ============================================================================
# GCP KMS Infrastructure - Main Configuration
# ============================================================================
# This Terraform configuration sets up GCP KMS infrastructure for encryption
# key management including key rings, crypto keys, service accounts, and IAM
# bindings for application access.
#
# Provider versioning and backend configuration are in versions.tf
# ============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  # Use Application Default Credentials (ADC) by default
  # For service account authentication, set GOOGLE_APPLICATION_CREDENTIALS
}

# ============================================================================
# KMS Key Ring
# ============================================================================
# A Key Ring is a grouping of cryptographic keys in a specific location.
# Keys cannot exist outside of a Key Ring.
# ============================================================================

resource "google_kms_key_ring" "main" {
  name     = var.key_ring_id
  location = var.location
}

# ============================================================================
# KMS Crypto Key
# ============================================================================
# The actual encryption key used for encrypt/decrypt operations.
# Configured with automatic rotation for security best practices.
# ============================================================================

resource "google_kms_crypto_key" "primary" {
  name            = var.key_id
  key_ring        = google_kms_key_ring.main.id
  rotation_period = var.rotation_period
  purpose         = "ENCRYPT_DECRYPT"

  # Version template controls how new key versions are created
  version_template {
    algorithm        = var.encryption_algorithm
    protection_level = var.protection_level
  }

  # Lifecycle management
  destroy_scheduled_duration = var.key_destruction_delay

  # Labels for resource organization
  labels = {
    managed-by  = "terraform"
    environment = var.environment
    scope       = "global" # Single primary key shared across all tenants
  }
}


# ============================================================================
# Service Account for Application Access
# ============================================================================
# Dedicated service account for the application to access KMS.
# This follows the principle of least privilege and enables audit logging.
# ============================================================================

resource "google_service_account" "kms_accessor" {
  account_id   = var.service_account_id
  display_name = "KMS Accessor Service Account"
  description  = "Service account for application access to GCP KMS encryption keys"

  # Ensure the service account is created before keys are generated
  depends_on = [
    google_kms_key_ring.main,
    google_kms_crypto_key.primary,
  ]
}

# ============================================================================
# IAM Bindings
# ============================================================================
# Grant the service account permission to use the KMS keys.
# Uses separate resources for production safety and manageability.
# ============================================================================

locals {
  kms_runtime_members = concat(
    ["serviceAccount:${google_service_account.kms_accessor.email}"],
    var.additional_iam_members
  )
}

# Encrypter/Decrypter role - required for application operations
resource "google_kms_crypto_key_iam_binding" "encrypter_decrypter" {
  crypto_key_id = google_kms_crypto_key.primary.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"

  members = local.kms_runtime_members
}

# Viewer role - required for health checks and key metadata access
resource "google_kms_crypto_key_iam_binding" "viewer" {
  crypto_key_id = google_kms_crypto_key.primary.id
  role          = "roles/cloudkms.viewer"

  members = local.kms_runtime_members
}

# Viewer role on key ring - required by application health check (getKeyRing)
resource "google_kms_key_ring_iam_binding" "viewer" {
  key_ring_id = google_kms_key_ring.main.id
  role        = "roles/cloudkms.viewer"

  members = local.kms_runtime_members
}

# Key-ring level encrypter/decrypter covers future keys created under this key ring.
resource "google_kms_key_ring_iam_binding" "encrypter_decrypter" {
  key_ring_id = google_kms_key_ring.main.id
  role        = "roles/cloudkms.cryptoKeyEncrypterDecrypter"

  members = local.kms_runtime_members
}

# Optional: Grant additional members access to the key
# This is useful for admin accounts or other services
resource "google_kms_crypto_key_iam_binding" "additional_encrypter_decrypter" {
  count = length(var.additional_iam_members) > 0 ? 1 : 0

  crypto_key_id = google_kms_crypto_key.primary.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"

  members = var.additional_iam_members
}


# ============================================================================
# Service Account Key (Optional)
# ============================================================================
# WARNING: Creating service account keys is a security risk.
# Prefer using Workload Identity for GKE or GCE instances.
# Only use this for non-Google Cloud platforms.
# ============================================================================

resource "google_service_account_key" "kms_accessor" {
  count = var.create_service_account_key ? 1 : 0

  service_account_id = google_service_account.kms_accessor.name
  private_key_type   = "TYPE_GOOGLE_CREDENTIALS_FILE"
  public_key_type    = "TYPE_X509_PEM_FILE"
}

# ============================================================================
# Key Ring IAM for Administrative Access
# ============================================================================
# Grant administrators permission to manage the key ring and its keys.
# ============================================================================

resource "google_kms_key_ring_iam_binding" "admin" {
  count = length(var.admin_iam_members) > 0 ? 1 : 0

  key_ring_id = google_kms_key_ring.main.id
  role        = "roles/cloudkms.admin"

  members = var.admin_iam_members
}

# ============================================================================
# Audit Logging
# ============================================================================
# Enable Cloud Audit Logs for KMS to track all key usage.
# This is critical for security monitoring and compliance.
# ============================================================================

resource "google_project_iam_audit_config" "kms_audit_config" {
  project = var.project_id
  service = "cloudkms.googleapis.com"

  audit_log_config {
    log_type = "ADMIN_READ"
  }

  audit_log_config {
    log_type = "DATA_READ"
  }

  audit_log_config {
    log_type = "DATA_WRITE"
  }
}
