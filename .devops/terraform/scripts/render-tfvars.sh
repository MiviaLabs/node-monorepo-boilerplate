#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT_DIR_NAME="${1:-}"
PROJECT_ID="${2:-}"
REGION="${3:-us-central1}"
ZONE="${4:-us-central1-a}"
AUTHORIZED_DOMAINS_CSV="${5:-}"
STORAGE_CORS_ORIGINS_CSV="${6:-}"

if [[ -z "${ENVIRONMENT_DIR_NAME}" || -z "${PROJECT_ID}" ]]; then
  echo "Usage: render-tfvars.sh <env> <project_id> [region] [zone] [authorized_domains_csv] [storage_cors_origins_csv]" >&2
  exit 1
fi

case "${ENVIRONMENT_DIR_NAME}" in
  dev)
    TF_ENVIRONMENT="dev"
    DEFAULT_DOMAINS=("localhost")
    ;;
  main)
    TF_ENVIRONMENT="prod"
    DEFAULT_DOMAINS=("localhost")
    ;;
  *)
    echo "Unsupported environment '${ENVIRONMENT_DIR_NAME}'. Use 'dev' or 'main'." >&2
    exit 1
    ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${ROOT_DIR}/environments/${ENVIRONMENT_DIR_NAME}"
mkdir -p "${TARGET_DIR}"

if [[ -n "${AUTHORIZED_DOMAINS_CSV}" ]]; then
  IFS=',' read -r -a AUTHORIZED_DOMAINS <<< "${AUTHORIZED_DOMAINS_CSV}"
else
  AUTHORIZED_DOMAINS=("${DEFAULT_DOMAINS[@]}")
fi

IDENTITY_DOMAINS_HCL=""
for domain in "${AUTHORIZED_DOMAINS[@]}"; do
  trimmed_domain="$(echo "${domain}" | xargs)"
  [[ -n "${trimmed_domain}" ]] || continue
  IDENTITY_DOMAINS_HCL="${IDENTITY_DOMAINS_HCL}  \"${trimmed_domain}\",\n"
done

if [[ -n "${STORAGE_CORS_ORIGINS_CSV}" ]]; then
  IFS=',' read -r -a STORAGE_CORS_ORIGINS <<< "${STORAGE_CORS_ORIGINS_CSV}"
else
  STORAGE_CORS_ORIGINS=()
fi

STORAGE_CORS_ORIGINS_HCL=""
for origin in "${STORAGE_CORS_ORIGINS[@]}"; do
  trimmed_origin="$(echo "${origin}" | xargs)"
  [[ -n "${trimmed_origin}" ]] || continue
  STORAGE_CORS_ORIGINS_HCL="${STORAGE_CORS_ORIGINS_HCL}  \"${trimmed_origin}\",\n"
done

cat > "${TARGET_DIR}/gcp-kms.tfvars" <<EOF
project_id  = "${PROJECT_ID}"
region      = "${REGION}"
zone        = "${ZONE}"
environment = "${TF_ENVIRONMENT}"

location           = "global"
key_ring_id        = "app-encryption-keys"
key_id             = "primary-encryption-key"
service_account_id = "kms-accessor-sa"

rotation_period            = "7776000s"
key_destruction_delay      = "86400s"
encryption_algorithm       = "GOOGLE_SYMMETRIC_ENCRYPTION"
protection_level           = "SOFTWARE"
create_service_account_key = false

additional_iam_members = []
admin_iam_members      = []
EOF

cat > "${TARGET_DIR}/gcp-identity.tfvars" <<EOF
project_id  = "${PROJECT_ID}"
region      = "${REGION}"
zone        = "${ZONE}"
environment = "${TF_ENVIRONMENT}"

firebase_admin_service_account_id = "firebase-adminsdk"
create_service_account_key        = false
create_api_key                    = true
api_key_display_name              = "identity-platform-web-key"

authorized_domains = [
$(printf "%b" "${IDENTITY_DOMAINS_HCL}")
]

allow_duplicate_emails   = false
enable_anonymous_users   = false
enable_email_password    = true
password_required        = true
disable_user_signup      = false
disable_user_deletion    = false
enable_multi_tenant      = true
create_default_tenant    = false
tenant_display_name      = "starter-kit-default-tenant"
allow_password_signup    = true
enable_email_link_signin = false

additional_admin_members = []
EOF

cat > "${TARGET_DIR}/gcp-storage.tfvars" <<EOF
project_id  = "${PROJECT_ID}"
region      = "${REGION}"
zone        = "${ZONE}"
environment = "${TF_ENVIRONMENT}"

default_instance = "uploads"

storage_instances = {
  uploads = {
    bucket_name               = "${PROJECT_ID}-${ENVIRONMENT_DIR_NAME}-app-uploads"
    bucket_location           = "US"
    storage_class             = "STANDARD"
    enable_versioning         = true
    lifecycle_delete_age_days = 0
    force_destroy             = false
    cors_origins = [
$(printf "%b" "${STORAGE_CORS_ORIGINS_HCL}")
    ]
    cors_methods                    = ["GET", "HEAD", "PUT", "POST"]
    cors_response_headers           = ["Content-Type", "Authorization"]
    cors_max_age_seconds            = 3600
    service_account_id              = "storage-uploads-sa"
    create_hmac_key                 = true
    additional_object_admin_members = []
    additional_object_viewer_members = []
    admin_iam_members               = []
  }
  avatars = {
    bucket_name               = "${PROJECT_ID}-${ENVIRONMENT_DIR_NAME}-user-avatars"
    bucket_location           = "US"
    storage_class             = "STANDARD"
    enable_versioning         = true
    lifecycle_delete_age_days = 0
    force_destroy             = false
    cors_origins = [
$(printf "%b" "${STORAGE_CORS_ORIGINS_HCL}")
    ]
    cors_methods                    = ["GET", "HEAD", "PUT", "POST"]
    cors_response_headers           = ["Content-Type", "Authorization"]
    cors_max_age_seconds            = 3600
    service_account_id              = "storage-avatars-sa"
    create_hmac_key                 = true
    additional_object_admin_members = []
    additional_object_viewer_members = []
    admin_iam_members               = []
  }
}
EOF

echo "Generated:"
echo "  ${TARGET_DIR}/gcp-kms.tfvars"
echo "  ${TARGET_DIR}/gcp-identity.tfvars"
echo "  ${TARGET_DIR}/gcp-storage.tfvars"
