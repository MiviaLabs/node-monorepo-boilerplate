# ============================================================================
# GCP KMS Infrastructure - Output Values
# ============================================================================
# These outputs are essential for configuring your application to use the
# KMS infrastructure. Terraform will display these after successful apply.
# ============================================================================

# ============================================================================
# Resource Identifiers
# ============================================================================
# These values are needed in your application's environment configuration
# ============================================================================

output "project_id" {
  description = "The GCP project ID where KMS resources were created"
  value       = var.project_id
}

output "location" {
  description = "The location of the KMS Key Ring (e.g., 'global', 'us-east1')"
  value       = var.location
}

output "key_ring_id" {
  description = "The ID of the KMS Key Ring (used in GCP_KMS_KEY_RING_ID environment variable)"
  value       = google_kms_key_ring.main.id
}

output "key_ring_name" {
  description = "The resource name of the KMS Key Ring (full path)"
  value       = google_kms_key_ring.main.name
}

output "crypto_key_id" {
  description = "The ID of the KMS Crypto Key (used in GCP_KEY_ID environment variable)"
  value       = google_kms_crypto_key.primary.id
}

output "crypto_key_name" {
  description = "The resource name of the KMS Crypto Key (full path)"
  value       = google_kms_crypto_key.primary.name
}


# ============================================================================
# Service Account Information
# ============================================================================
# These values are critical for application authentication
# ============================================================================

output "service_account_email" {
  description = "The email address of the service account for KMS access (used for workload identity or ADC configuration)"
  value       = google_service_account.kms_accessor.email
}

output "service_account_id" {
  description = "The unique ID of the service account"
  value       = google_service_account.kms_accessor.name
}

output "service_account_iam_email" {
  description = "The email in IAM format (e.g., 'serviceAccount:kms-accessor@project.iam.gserviceaccount.com')"
  value       = "serviceAccount:${google_service_account.kms_accessor.email}"
}

# ============================================================================
# Service Account Key (if created)
# ============================================================================
# WARNING: This output contains sensitive material. Handle with care.
# ============================================================================

output "service_account_private_key" {
  description = "WARNING: SENSITIVE! The private key for the service account (only if create_service_account_key = true). Store this securely and never commit to version control."
  value       = try(google_service_account_key.kms_accessor[0].private_key, null)
  sensitive   = true
}

output "gcp_credentials_base64" {
  description = "Sensitive base64-encoded Google credentials JSON for GCP_CREDENTIALS_BASE64 (only if create_service_account_key = true)."
  value       = try(google_service_account_key.kms_accessor[0].private_key, null)
  sensitive   = true
}

output "service_account_key_id" {
  description = "The unique ID of the service account key (for auditing and key management)"
  value       = try(google_service_account_key.kms_accessor[0].id, null)
  sensitive   = false
}

# ============================================================================
# GCP KMS Resource Paths
# ============================================================================
# Full resource paths for use in application code
# ============================================================================

output "kms_key_resource_path" {
  description = "Full resource path to the crypto key (used in application code)"
  value       = "projects/${var.project_id}/locations/${var.location}/keyRings/${var.key_ring_id}/cryptoKeys/${var.key_id}"
}

output "kms_keyring_resource_path" {
  description = "Full resource path to the key ring"
  value       = "projects/${var.project_id}/locations/${var.location}/keyRings/${var.key_ring_id}"
}

# ============================================================================
# IAM Policy Information
# ============================================================================
# Useful for auditing and access verification
# ============================================================================

output "encrypter_decrypter_iam_members" {
  description = "IAM members with encrypt/decrypt access"
  value = flatten([
    google_service_account.kms_accessor.email,
    var.additional_iam_members
  ])
}

output "admin_iam_members" {
  description = "IAM members with admin access to the key ring"
  value       = var.admin_iam_members
}

# ============================================================================
# Application Configuration Snippet
# ============================================================================
# A ready-to-use environment configuration snippet
# ============================================================================

output "app_env_config" {
  description = "Environment variables to configure in your application"
  value = {
    GCP_PROJECT_ID            = var.project_id
    GCP_LOCATION_ID           = var.location
    GCP_KEY_RING_ID           = var.key_ring_id
    GCP_KEY_ID                = var.key_id
    GCP_SERVICE_ACCOUNT_EMAIL = google_service_account.kms_accessor.email
  }
}

output "app_env_config_sensitive" {
  description = "Sensitive environment variables to configure in your application"
  value = {
    GCP_CREDENTIALS_BASE64 = try(google_service_account_key.kms_accessor[0].private_key, null)
  }
  sensitive = true
}

# ============================================================================
# Important Security Notes
# ============================================================================
# Displayed after deployment to remind about security best practices
# ============================================================================

output "security_reminders" {
  description = "Security reminders and next steps"
  value       = <<-EOT
    SECURITY REMINDERS:

    1. Service Account Key:
       ${var.create_service_account_key ? "⚠️  A service account key was created. Store it securely in a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)." : "✅ No service account key created. Using Workload Identity or ADC (recommended)."}

    2. Key Rotation:
       ℹ️  Key rotation is enabled with a period of ${var.rotation_period}.
       ℹ️  Monitor key health and set up alerts for rotation events.

    3. IAM Permissions:
       ℹ️  Regularly audit who has access to these keys.
       ℹ️  Remove unnecessary IAM bindings.

    4. Audit Logging:
       ℹ️  Cloud Audit Logs are enabled for all KMS operations.
       ℹ️  Set up log-based alerts for suspicious activity.

    5. Monitoring:
       ℹ️  Set up Cloud Monitoring dashboards for KMS key usage.
       ℹ️  Create alerts for failed decrypt operations (may indicate attacks).
  EOT
}

# ============================================================================
# Useful Commands
# ============================================================================
# Helpful gcloud commands for ongoing operations
# ============================================================================

output "useful_commands" {
  description = "Useful gcloud commands for managing your KMS infrastructure"
  value       = <<-EOT
    # View key versions
    gcloud kms keys versions list ${var.key_id} \
      --location=${var.location} \
      --keyring=${var.key_ring_id} \
      --project=${var.project_id}

    # Encrypt a file
    gcloud kms encrypt \
      --location=${var.location} \
      --keyring=${var.key_ring_id} \
      --key=${var.key_id} \
      --plaintext-file=input.txt \
      --ciphertext-file=output.enc \
      --project=${var.project_id}

    # Decrypt a file
    gcloud kms decrypt \
      --location=${var.location} \
      --keyring=${var.key_ring_id} \
      --key=${var.key_id} \
      --ciphertext-file=output.enc \
      --plaintext-file=decrypted.txt \
      --project=${var.project_id}

    # View IAM policy
    gcloud kms keys get-iam-policy ${var.key_id} \
      --location=${var.location} \
      --keyring=${var.key_ring_id} \
      --project=${var.project_id}

    # Grant additional IAM member access
    gcloud kms keys add-iam-policy-binding ${var.key_id} \
      --location=${var.location} \
      --keyring=${var.key_ring_id} \
      --member='user:example@example.com' \
      --role='roles/cloudkms.cryptoKeyEncrypterDecrypter' \
      --project=${var.project_id}
  EOT
}
