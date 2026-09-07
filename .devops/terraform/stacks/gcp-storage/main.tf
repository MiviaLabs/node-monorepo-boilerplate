# ============================================================================
# GCP Storage Infrastructure - Main Configuration
# ============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

locals {
  storage_instances_ordered = concat(
    [var.default_instance],
    [for instance_name in sort(keys(var.storage_instances)) : instance_name if instance_name != var.default_instance]
  )
  hmac_instances = {
    for instance_name, config in var.storage_instances :
    instance_name => config if config.create_hmac_key
  }
}

resource "google_project_service" "storage" {
  project            = var.project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  project            = var.project_id
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

resource "google_storage_bucket" "instance" {
  for_each = var.storage_instances

  name     = each.value.bucket_name
  project  = var.project_id
  location = each.value.bucket_location

  storage_class               = each.value.storage_class
  force_destroy               = each.value.force_destroy
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = each.value.enable_versioning
  }

  dynamic "cors" {
    for_each = length(each.value.cors_origins) > 0 ? [1] : []

    content {
      origin          = each.value.cors_origins
      method          = each.value.cors_methods
      response_header = each.value.cors_response_headers
      max_age_seconds = each.value.cors_max_age_seconds
    }
  }

  dynamic "lifecycle_rule" {
    for_each = each.value.lifecycle_delete_age_days > 0 ? [1] : []

    content {
      action {
        type = "Delete"
      }

      condition {
        age = each.value.lifecycle_delete_age_days
      }
    }
  }

  labels = {
    managed-by  = "terraform"
    environment = var.environment
    stack       = "gcp-storage"
    instance    = each.key
  }

  depends_on = [google_project_service.storage]
}

resource "google_service_account" "storage_operator" {
  for_each = var.storage_instances

  account_id   = each.value.service_account_id
  display_name = "Storage Operator ${title(replace(each.key, "-", " "))}"
  description  = "Service account for ${each.key} object storage access on GCS via the S3-compatible XML API"

  depends_on = [google_project_service.iam]
}

locals {
  runtime_members = {
    for instance_name, service_account in google_service_account.storage_operator :
    instance_name => "serviceAccount:${service_account.email}"
  }
}

resource "google_storage_bucket_iam_member" "runtime_object_admin" {
  for_each = var.storage_instances

  bucket = google_storage_bucket.instance[each.key].name
  role   = "roles/storage.objectAdmin"
  member = local.runtime_members[each.key]
}

resource "google_storage_bucket_iam_member" "additional_object_admin" {
  for_each = merge([
    for instance_name, config in var.storage_instances : {
      for member in config.additional_object_admin_members :
      "${instance_name}::${member}" => {
        instance_name = instance_name
        member        = member
      }
    }
  ]...)

  bucket = google_storage_bucket.instance[each.value.instance_name].name
  role   = "roles/storage.objectAdmin"
  member = each.value.member
}

resource "google_storage_bucket_iam_member" "additional_object_viewer" {
  for_each = merge([
    for instance_name, config in var.storage_instances : {
      for member in config.additional_object_viewer_members :
      "${instance_name}::${member}" => {
        instance_name = instance_name
        member        = member
      }
    }
  ]...)

  bucket = google_storage_bucket.instance[each.value.instance_name].name
  role   = "roles/storage.objectViewer"
  member = each.value.member
}

resource "google_storage_bucket_iam_member" "bucket_admin" {
  for_each = merge([
    for instance_name, config in var.storage_instances : {
      for member in config.admin_iam_members :
      "${instance_name}::${member}" => {
        instance_name = instance_name
        member        = member
      }
    }
  ]...)

  bucket = google_storage_bucket.instance[each.value.instance_name].name
  role   = "roles/storage.admin"
  member = each.value.member
}

resource "google_storage_hmac_key" "storage_operator" {
  for_each = local.hmac_instances

  project               = var.project_id
  service_account_email = google_service_account.storage_operator[each.key].email
  state                 = "ACTIVE"
}
