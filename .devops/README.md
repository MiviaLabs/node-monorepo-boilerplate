# DevOps Infrastructure

Terraform and tooling for provisioning the GCP environment that backs
the MiviaLabs monorepo. Local development uses MinIO and other services
from the devcontainer compose stack; this directory is the GCP counterpart.

## Active Terraform Stacks

Under `.devops/terraform/stacks/`:

- **`gcp-kms`** — Shared KMS key ring, crypto key, application service
  account, and IAM bindings used by the encryption layer.
- **`gcp-identity`** — Identity Platform baseline, Firebase Admin service
  account, restricted API key, and optional default tenant.
- **`gcp-storage`** — Private GCS bucket with HMAC credentials for
  S3-compatible access, lifecycle and CORS controls.

Environment-specific inputs live under `.devops/terraform/environments/`:

- `dev` — development environment
- `main` — production-like environment aligned with the `main` branch
  (internally Terraform `environment = "prod"`)

Use the shared Makefile entrypoint rather than stack-local helpers:

```bash
make -C .devops/terraform help
```

## Provisioning a Fresh Environment

### Prerequisites

1. Create or pick a GCP project.

   ```bash
   gcloud projects create PROJECT_ID
   gcloud config set project PROJECT_ID
   ```

2. Enable required APIs.

   ```bash
   gcloud services enable \
     cloudkms.googleapis.com \
     storage.googleapis.com \
     identitytoolkit.googleapis.com \
     firebase.googleapis.com \
     apikeys.googleapis.com \
     cloudresourcemanager.googleapis.com \
     iam.googleapis.com \
     --project=PROJECT_ID
   ```

3. Authenticate Terraform.

   ```bash
   gcloud auth application-default login
   ```

4. Attach quota usage to the target project so Identity Platform and
   API Keys do not return a 403 from local credentials.

   ```bash
   gcloud auth application-default set-quota-project PROJECT_ID
   ```

### Bootstrap Environment Configs

Generate per-environment Terraform variable files from a single project id:

```bash
make -C .devops/terraform bootstrap ENV=dev  PROJECT_ID=PROJECT_ID
make -C .devops/terraform bootstrap ENV=main PROJECT_ID=PROJECT_ID
```

Optional Identity Platform domain override:

```bash
make -C .devops/terraform bootstrap \
  ENV=main \
  PROJECT_ID=PROJECT_ID \
  IDENTITY_AUTHORIZED_DOMAINS=app.example.com,admin.example.com
```

Optional storage CORS override:

```bash
make -C .devops/terraform bootstrap \
  ENV=main \
  PROJECT_ID=PROJECT_ID \
  STORAGE_CORS_ORIGINS=http://localhost:3000,https://app.example.com
```

### Deploy KMS

```bash
make -C .devops/terraform init   ENV=dev STACK=gcp-kms
make -C .devops/terraform plan   ENV=dev STACK=gcp-kms
make -C .devops/terraform apply  ENV=dev STACK=gcp-kms
make -C .devops/terraform outputs ENV=dev STACK=gcp-kms
```

Resources created:

- Key ring `app-encryption-keys`
- Crypto key `primary-encryption-key`
- Application KMS service account with encrypt/decrypt and viewer bindings
- Project audit logging for Cloud KMS

### Deploy Identity Platform

```bash
make -C .devops/terraform init   ENV=dev STACK=gcp-identity
make -C .devops/terraform plan   ENV=dev STACK=gcp-identity
make -C .devops/terraform apply  ENV=dev STACK=gcp-identity
make -C .devops/terraform outputs ENV=dev STACK=gcp-identity
```

Resources created:

- Identity Platform project config with email/password baseline
- Firebase Admin service account with `roles/firebaseauth.admin`
- Restricted API key for `identitytoolkit.googleapis.com`
- Optional default tenant for multi-tenant auth

The provider is configured with `user_project_override = true` and
`billing_project = PROJECT_ID` so quota is billed against the target project.

### Deploy Object Storage

```bash
make -C .devops/terraform init   ENV=dev STACK=gcp-storage
make -C .devops/terraform plan   ENV=dev STACK=gcp-storage
make -C .devops/terraform apply  ENV=dev STACK=gcp-storage
make -C .devops/terraform outputs ENV=dev STACK=gcp-storage
```

Resources created:

- Private GCS bucket with public access prevention
- Uniform bucket-level access enabled
- Storage operator service account with object admin access
- HMAC credentials for S3-compatible XML API access
- Optional versioning, lifecycle deletion, and CORS rules

### Plan All Stacks for One Environment

```bash
make -C .devops/terraform plan-all ENV=dev
make -C .devops/terraform plan-all ENV=main
```

If apply still fails with a quota-related 403, re-run:

```bash
gcloud config set project PROJECT_ID
gcloud auth application-default set-quota-project PROJECT_ID
```

## Application Configuration

Minimum environment variables:

```bash
GCP_PROJECT_ID=your-project-id
GCP_LOCATION_ID=global
GCP_KEY_RING_ID=app-encryption-keys
GCP_KEY_ID=primary-encryption-key
S3_BUCKET=your-project-id-dev-app-storage
S3_ENDPOINT=https://storage.googleapis.com
S3_ACCESS_KEY_ID=GOOGTS...
S3_SECRET_ACCESS_KEY=...
GCP_STORAGE_SERVICE_ACCOUNT_EMAIL=storage-operator-sa@your-project-id.iam.gserviceaccount.com

GOOGLE_CLOUD_PROJECT_ID=your-project-id
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=AIza...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project-id.iam.gserviceaccount.com
# Needed only outside ADC / Workload Identity:
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# Optional when using Identity Platform tenants:
FIREBASE_TENANT_ID=tenant-id
```

Authentication guidance:

- GCP runtimes: Application Default Credentials or Workload Identity.
- S3-compatible runtimes: HMAC access key + secret against `https://storage.googleapis.com`.

## Verification

```bash
gcloud kms keyrings describe app-encryption-keys \
  --location=global \
  --project=PROJECT_ID

gcloud kms keys describe primary-encryption-key \
  --location=global \
  --keyring=app-encryption-keys \
  --project=PROJECT_ID

gcloud kms keys versions list primary-encryption-key \
  --location=global \
  --keyring=app-encryption-keys \
  --project=PROJECT_ID

gcloud iam service-accounts describe FIREBASE_ADMIN_SA_EMAIL \
  --project=PROJECT_ID

gcloud projects get-iam-policy PROJECT_ID \
  --flatten='bindings[].members' \
  --filter='bindings.role:roles/firebaseauth.admin'

gcloud storage buckets describe gs://BUCKET_NAME \
  --project=PROJECT_ID
```

## Repository Layout

```text
.devops/
├── README.md
└── terraform/
    ├── Makefile
    ├── environments/
    │   ├── dev/
    │   └── main/
    ├── scripts/
    └── stacks/
        ├── gcp-identity/
        ├── gcp-kms/
        └── gcp-storage/
```

## References

- [Terraform orchestration](terraform/README.md)
- [GCP KMS Terraform stack](terraform/stacks/gcp-kms/README.md)
- [GCP Identity Terraform stack](terraform/stacks/gcp-identity/README.md)
- [GCP Storage Terraform stack](terraform/stacks/gcp-storage/README.md)