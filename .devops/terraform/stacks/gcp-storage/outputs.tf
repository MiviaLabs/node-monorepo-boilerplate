# ============================================================================
# GCP Storage Infrastructure - Output Values
# ============================================================================

locals {
  storage_instance_env = merge(
    {
      STORAGE_PROVIDER         = "s3"
      STORAGE_DEFAULT_INSTANCE = var.default_instance
      STORAGE_INSTANCES        = join(",", local.storage_instances_ordered)
    },
    merge([
      for instance_name in local.storage_instances_ordered : {
        "STORAGE_${upper(replace(instance_name, "-", "_"))}_DEFAULT_BUCKET"                   = google_storage_bucket.instance[instance_name].name
        "STORAGE_${upper(replace(instance_name, "-", "_"))}_S3_ENDPOINT"                      = "https://storage.googleapis.com"
        "STORAGE_${upper(replace(instance_name, "-", "_"))}_S3_REGION"                        = var.region
        "STORAGE_${upper(replace(instance_name, "-", "_"))}_S3_ACCESS_KEY_ID"                 = try(google_storage_hmac_key.storage_operator[instance_name].access_id, null)
        "STORAGE_${upper(replace(instance_name, "-", "_"))}_S3_FORCE_PATH_STYLE"              = "false"
        "STORAGE_${upper(replace(instance_name, "-", "_"))}_S3_BUCKET"                        = google_storage_bucket.instance[instance_name].name
        "STORAGE_${upper(replace(instance_name, "-", "_"))}_S3_PUBLIC_BASE_URL"               = ""
        "STORAGE_${upper(replace(instance_name, "-", "_"))}_S3_SIGNED_URL_EXPIRES_IN_SECONDS" = "900"
        "GCP_STORAGE_${upper(replace(instance_name, "-", "_"))}_SERVICE_ACCOUNT_EMAIL"        = google_service_account.storage_operator[instance_name].email
      }
    ]...)
  )
  storage_instance_env_sensitive = merge([
    for instance_name in local.storage_instances_ordered : {
      "STORAGE_${upper(replace(instance_name, "-", "_"))}_S3_SECRET_ACCESS_KEY" = try(google_storage_hmac_key.storage_operator[instance_name].secret, null)
    }
  ]...)
}

output "project_id" {
  description = "The GCP project ID where storage resources were created"
  value       = var.project_id
}

output "bucket_names" {
  description = "Bucket name by storage instance"
  value = {
    for instance_name, bucket in google_storage_bucket.instance :
    instance_name => bucket.name
  }
}

output "bucket_urls" {
  description = "gs:// URL by storage instance"
  value = {
    for instance_name, bucket in google_storage_bucket.instance :
    instance_name => "gs://${bucket.name}"
  }
}

output "bucket_self_links" {
  description = "Bucket self link by storage instance"
  value = {
    for instance_name, bucket in google_storage_bucket.instance :
    instance_name => bucket.self_link
  }
}

output "bucket_locations" {
  description = "Configured bucket location by storage instance"
  value = {
    for instance_name, bucket in google_storage_bucket.instance :
    instance_name => bucket.location
  }
}

output "storage_operator_service_account_emails" {
  description = "Storage operator service account email by storage instance"
  value = {
    for instance_name, service_account in google_service_account.storage_operator :
    instance_name => service_account.email
  }
}

output "storage_operator_service_account_iam_emails" {
  description = "IAM principal string by storage instance"
  value = {
    for instance_name, service_account in google_service_account.storage_operator :
    instance_name => "serviceAccount:${service_account.email}"
  }
}

output "s3_endpoint" {
  description = "S3-compatible endpoint for GCS XML API access"
  value       = "https://storage.googleapis.com"
}

output "s3_access_key_ids" {
  description = "S3-compatible access key ID by storage instance when create_hmac_key is true"
  value = {
    for instance_name in local.storage_instances_ordered :
    instance_name => try(google_storage_hmac_key.storage_operator[instance_name].access_id, null)
  }
}

output "s3_secret_access_keys" {
  description = "Sensitive S3-compatible secret access key by storage instance when create_hmac_key is true"
  value = {
    for instance_name in local.storage_instances_ordered :
    instance_name => try(google_storage_hmac_key.storage_operator[instance_name].secret, null)
  }
  sensitive = true
}

output "api_env_config" {
  description = "Non-sensitive environment variables for the API storage module"
  value       = local.storage_instance_env
}

output "api_env_config_sensitive" {
  description = "Sensitive environment variables for the API storage module"
  value       = local.storage_instance_env_sensitive
  sensitive   = true
}

output "security_reminders" {
  description = "Security reminders and next steps"
  value       = <<-EOT
    SECURITY REMINDERS:

    1. Public Access:
       ✅ Public access prevention is enforced on every bucket.
       ℹ️  Uniform bucket-level access is enabled on every bucket.

    2. S3-Compatible Credentials:
       ${length(local.hmac_instances) > 0 ? "⚠️  HMAC keys were created for the configured storage instances. Store each secret immediately in a secret manager." : "ℹ️  No HMAC keys were created. XML API access must be configured separately."}

    3. Data Retention:
       Review lifecycle and versioning per bucket:
       ${join("\n       ", [for instance_name, config in var.storage_instances : "${instance_name}: versioning=${config.enable_versioning}, lifecycle_delete_age_days=${config.lifecycle_delete_age_days}"])}
  EOT
}

output "useful_commands" {
  description = "Useful gcloud commands for managing object storage"
  value = join("\n\n", [
    for instance_name in local.storage_instances_ordered : <<-EOT
    # Describe the ${instance_name} bucket
    gcloud storage buckets describe gs://${google_storage_bucket.instance[instance_name].name} \
      --project=${var.project_id}

    # List objects in the ${instance_name} bucket
    gcloud storage ls gs://${google_storage_bucket.instance[instance_name].name}

    # Inspect IAM on the ${instance_name} bucket
    gcloud storage buckets get-iam-policy gs://${google_storage_bucket.instance[instance_name].name} \
      --project=${var.project_id}

    # List HMAC keys for the ${instance_name} service account
    gcloud storage hmac list --project=${var.project_id} \
      --service-account=${google_service_account.storage_operator[instance_name].email}
    EOT
  ])
}
