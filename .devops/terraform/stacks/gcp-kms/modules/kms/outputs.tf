# ============================================================================
# GCP KMS Module - Output Values
# ============================================================================

output "key_ring_id" {
  description = "The ID of the KMS Key Ring"
  value       = google_kms_key_ring.main.id
}

output "key_ring_name" {
  description = "The name of the KMS Key Ring"
  value       = google_kms_key_ring.main.name
}

output "crypto_keys" {
  description = "Map of created crypto keys"
  value = {
    for key, crypto_key in google_kms_crypto_key.this :
    key => {
      id      = crypto_key.id
      name    = crypto_key.name
      purpose = crypto_key.purpose
    }
  }
}

output "service_account_email" {
  description = "The email of the created service account"
  value       = try(google_service_account.this[0].email, null)
}

output "service_account_name" {
  description = "The name of the created service account"
  value       = try(google_service_account.this[0].name, null)
}

output "kms_resource_paths" {
  description = "Full resource paths for all crypto keys"
  value = {
    for key, crypto_key in google_kms_crypto_key.this :
    key => crypto_key.id
  }
}
