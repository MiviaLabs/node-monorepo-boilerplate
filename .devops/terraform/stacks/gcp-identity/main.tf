# ============================================================================
# GCP Identity Platform Infrastructure - Main Configuration
# ============================================================================

provider "google" {
  project               = var.project_id
  region                = var.region
  zone                  = var.zone
  user_project_override = true
  billing_project       = var.project_id
}

resource "google_project_service" "identitytoolkit" {
  project            = var.project_id
  service            = "identitytoolkit.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firebase" {
  project            = var.project_id
  service            = "firebase.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "apikeys" {
  count              = var.create_api_key ? 1 : 0
  project            = var.project_id
  service            = "apikeys.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  project            = var.project_id
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

resource "google_identity_platform_config" "default" {
  project = var.project_id

  authorized_domains = var.authorized_domains

  sign_in {
    allow_duplicate_emails = var.allow_duplicate_emails

    anonymous {
      enabled = var.enable_anonymous_users
    }

    email {
      enabled           = var.enable_email_password
      password_required = var.password_required
    }
  }

  client {
    permissions {
      disabled_user_signup   = var.disable_user_signup
      disabled_user_deletion = var.disable_user_deletion
    }
  }

  multi_tenant {
    allow_tenants = var.enable_multi_tenant || var.create_default_tenant
  }

  depends_on = [
    google_project_service.identitytoolkit,
    google_project_service.firebase,
  ]
}

resource "google_identity_platform_tenant" "default" {
  count = var.create_default_tenant ? 1 : 0

  project                  = var.project_id
  display_name             = var.tenant_display_name
  allow_password_signup    = var.allow_password_signup
  enable_email_link_signin = var.enable_email_link_signin

  depends_on = [google_identity_platform_config.default]
}

resource "google_service_account" "firebase_admin" {
  account_id   = var.firebase_admin_service_account_id
  display_name = "Firebase Admin SDK Service Account"
  description  = "Service account used by the starter kit to administer Identity Platform and Firebase Auth"

  depends_on = [google_project_service.iam]
}

resource "google_project_iam_member" "firebase_auth_admin_service_account" {
  project = var.project_id
  role    = "roles/firebaseauth.admin"
  member  = "serviceAccount:${google_service_account.firebase_admin.email}"

  depends_on = [
    google_project_service.identitytoolkit,
    google_service_account.firebase_admin,
  ]
}

resource "google_project_iam_member" "firebase_auth_admin_additional_members" {
  for_each = toset(var.additional_admin_members)

  project = var.project_id
  role    = "roles/firebaseauth.admin"
  member  = each.value

  depends_on = [google_project_service.identitytoolkit]
}

resource "google_service_account_key" "firebase_admin" {
  count = var.create_service_account_key ? 1 : 0

  service_account_id = google_service_account.firebase_admin.name
  public_key_type    = "TYPE_X509_PEM_FILE"
}

resource "google_apikeys_key" "identity_platform" {
  count = var.create_api_key ? 1 : 0

  name         = var.api_key_display_name
  project      = var.project_id
  display_name = var.api_key_display_name

  restrictions {
    api_targets {
      service = "identitytoolkit.googleapis.com"
    }
  }

  depends_on = [
    google_project_service.apikeys,
    google_project_service.identitytoolkit,
  ]
}
