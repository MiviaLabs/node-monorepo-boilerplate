# ============================================================================
# GCP Identity Platform Infrastructure - Output Values
# ============================================================================

output "project_id" {
  description = "The GCP project ID where Identity Platform resources were created"
  value       = var.project_id
}

output "identity_platform_authorized_domains" {
  description = "Authorized domains configured for Identity Platform"
  value       = var.authorized_domains
}

output "firebase_admin_service_account_email" {
  description = "Service account email for Firebase Admin SDK operations"
  value       = google_service_account.firebase_admin.email
}

output "firebase_admin_service_account_name" {
  description = "Fully-qualified service account name"
  value       = google_service_account.firebase_admin.name
}

output "firebase_admin_service_account_iam_email" {
  description = "Service account principal string for IAM bindings"
  value       = "serviceAccount:${google_service_account.firebase_admin.email}"
}

output "identity_platform_api_key" {
  description = "API key for Identity Platform client SDK usage"
  value       = try(google_apikeys_key.identity_platform[0].key_string, null)
  sensitive   = true
}

output "tenant_id" {
  description = "Tenant ID when a default tenant is created"
  value       = try(element(reverse(split("/", google_identity_platform_tenant.default[0].name)), 0), null)
}

output "service_account_private_key" {
  description = "Sensitive private key for the Firebase Admin service account when create_service_account_key is true"
  value = try(
    jsondecode(base64decode(google_service_account_key.firebase_admin[0].private_key)).private_key,
    null
  )
  sensitive = true
}

output "service_account_key_json" {
  description = "Sensitive JSON credentials payload for the Firebase Admin service account"
  value       = try(base64decode(google_service_account_key.firebase_admin[0].private_key), null)
  sensitive   = true
}

output "firebase_credentials_json" {
  description = "Sensitive Firebase Admin service account credentials JSON for direct secret-manager or env injection"
  value       = try(base64decode(google_service_account_key.firebase_admin[0].private_key), null)
  sensitive   = true
}

output "app_env_config" {
  description = "Non-sensitive environment variables to configure in the application"
  value = {
    GOOGLE_CLOUD_PROJECT_ID = var.project_id
    FIREBASE_PROJECT_ID     = var.project_id
    FIREBASE_CLIENT_EMAIL   = google_service_account.firebase_admin.email
    FIREBASE_TENANT_ID      = try(element(reverse(split("/", google_identity_platform_tenant.default[0].name)), 0), null)
  }
}

output "app_env_config_sensitive" {
  description = "Sensitive environment variables to configure in the application"
  value = {
    FIREBASE_API_KEY = try(google_apikeys_key.identity_platform[0].key_string, null)
    FIREBASE_PRIVATE_KEY = try(
      jsondecode(base64decode(google_service_account_key.firebase_admin[0].private_key)).private_key,
      null
    )
  }
  sensitive = true
}

output "security_reminders" {
  description = "Security reminders and next steps"
  value       = <<-EOT
    SECURITY REMINDERS:

    1. Admin Credentials:
       ${var.create_service_account_key ? "⚠️  A service account key was created. Store the JSON securely and inject FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL through a secret manager." : "✅ No service account key created. Prefer ADC or Workload Identity on GCP runtimes."}

    2. API Key:
       ${var.create_api_key ? "ℹ️  An Identity Platform API key was created with API target restrictions for identitytoolkit.googleapis.com." : "⚠️  No API key was created. Client-side Identity Platform flows that require FIREBASE_API_KEY must be configured separately."}

    3. Tenanting:
       ${var.create_default_tenant ? "ℹ️  A default tenant was created. Propagate FIREBASE_TENANT_ID where tenant-aware auth is required." : "ℹ️  No tenant was created. FIREBASE_TENANT_ID remains optional unless you enable multi-tenant auth flows."}

    4. IAM Permissions:
       ℹ️  The Firebase admin service account received roles/firebaseauth.admin.
       ℹ️  Audit any additional admin members regularly.
  EOT
}

output "useful_commands" {
  description = "Useful gcloud commands for managing Identity Platform"
  value       = <<-EOT
    # Check enabled services
    gcloud services list --enabled --project=${var.project_id} | rg 'identitytoolkit|firebase|apikeys|iam'

    # Describe the Firebase admin service account
    gcloud iam service-accounts describe ${google_service_account.firebase_admin.email} \
      --project=${var.project_id}

    # View project IAM bindings for Firebase Authentication Admin
    gcloud projects get-iam-policy ${var.project_id} \
      --flatten='bindings[].members' \
      --filter='bindings.role:roles/firebaseauth.admin'

    # List API keys
    gcloud services api-keys list --project=${var.project_id}
  EOT
}
