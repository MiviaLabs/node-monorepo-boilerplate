# ============================================================================
# GCP KMS Module - Reusable KMS Infrastructure Module
# ============================================================================
# This module creates a complete KMS setup including key ring, crypto key,
# service account, and IAM bindings. It's designed to be reusable across
# multiple environments or applications.
# ============================================================================

# ============================================================================
# KMS Key Ring
# ============================================================================

resource "google_kms_key_ring" "main" {
  name     = var.key_ring_id
  location = var.location

  labels = var.labels
}

# ============================================================================
# KMS Crypto Keys
# ============================================================================

resource "google_kms_crypto_key" "this" {
  for_each = var.crypto_keys

  name            = each.value.key_id
  key_ring        = google_kms_key_ring.main.id
  rotation_period = each.value.rotation_period
  purpose         = "ENCRYPT_DECRYPT"

  version_template {
    algorithm        = each.value.algorithm
    protection_level = each.value.protection_level
  }

  destroy_scheduled_duration = each.value.destruction_delay

  labels = var.labels
}

# ============================================================================
# Service Account (optional)
# ============================================================================

resource "google_service_account" "this" {
  count = var.create_service_account ? 1 : 0

  account_id   = var.service_account_id
  display_name = var.service_account_display_name
  description  = var.service_account_description
}

# ============================================================================
# IAM Bindings
# ============================================================================

# Encrypter/Decrypter for each key
resource "google_kms_crypto_key_iam_binding" "encrypter_decrypter" {
  for_each = var.crypto_keys

  crypto_key_id = google_kms_crypto_key.this[each.key].id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"

  members = concat(
    var.create_service_account ? ["serviceAccount:${google_service_account.this[0].email}"] : [],
    var.encrypter_decrypter_members
  )
}

# Viewer for each key
resource "google_kms_crypto_key_iam_binding" "viewer" {
  for_each = var.crypto_keys

  crypto_key_id = google_kms_crypto_key.this[each.key].id
  role          = "roles/cloudkms.viewer"

  members = concat(
    var.create_service_account ? ["serviceAccount:${google_service_account.this[0].email}"] : [],
    var.viewer_members
  )
}

# Viewer access on key ring - required by provider health checks that read key ring metadata
resource "google_kms_key_ring_iam_binding" "viewer" {
  key_ring_id = google_kms_key_ring.main.id
  role        = "roles/cloudkms.viewer"

  members = concat(
    var.create_service_account ? ["serviceAccount:${google_service_account.this[0].email}"] : [],
    var.viewer_members
  )
}

# Admin access to key ring
resource "google_kms_key_ring_iam_binding" "admin" {
  count = length(var.admin_members) > 0 ? 1 : 0

  key_ring_id = google_kms_key_ring.main.id
  role        = "roles/cloudkms.admin"

  members = var.admin_members
}
