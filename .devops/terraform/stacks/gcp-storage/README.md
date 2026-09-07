# GCP Storage Infrastructure - Terraform Configuration

This Terraform stack provisions private Google Cloud Storage buckets for the API's named storage instances, along with S3-compatible access via the GCS XML API and HMAC credentials.

## Overview

The API currently routes files to two logical storage instances:

- `uploads`: issue attachments and content uploads
- `avatars`: user avatar images

This stack provisions those instances explicitly instead of collapsing everything into one generic bucket.

The infrastructure created by this configuration includes:

- One private GCS bucket per storage instance
- Uniform bucket-level access enabled by default
- Public access prevention enforced by default
- Optional versioning and lifecycle deletion per bucket
- One service account per storage instance
- Optional HMAC key per storage instance for S3-compatible clients

## Prerequisites

Required tools:

- Terraform >= 1.5.0
- Google Cloud SDK (`gcloud`)

Required permissions for the account running Terraform:

- `roles/storage.admin`
- `roles/serviceusage.serviceUsageAdmin`
- `roles/iam.serviceAccountAdmin`
- `roles/storage.hmacKeyAdmin` or equivalent permissions to create HMAC keys for S3-compatible access

Authenticate with Application Default Credentials:

```bash
gcloud auth application-default login
gcloud config set project PROJECT_ID
```

## Quick Start

1. Bootstrap environment config from the shared Terraform Makefile:

```bash
make -C .. bootstrap ENV=dev PROJECT_ID=my-gcp-project-id
```

That generates `../environments/dev/gcp-storage.tfvars` with two named instances:

- `uploads`
- `avatars`

2. Initialize and apply:

```bash
make -C .. init ENV=dev STACK=gcp-storage
make -C .. plan ENV=dev STACK=gcp-storage
make -C .. apply ENV=dev STACK=gcp-storage
```

3. Retrieve outputs:

```bash
make -C .. outputs ENV=dev STACK=gcp-storage
```

## What This Stack Configures

Bucket security:

- Enables uniform bucket-level access on every bucket
- Enforces public access prevention on every bucket
- Keeps `force_destroy = false` by default on every bucket

Application access:

- Creates a dedicated service account per storage instance
- Grants `roles/storage.objectAdmin` on that instance's bucket to its service account
- Can grant viewer, admin, or extra object-admin access to additional IAM members per instance

Data management:

- Enables object versioning by default per bucket
- Supports optional lifecycle deletion after a configured age per bucket
- Supports optional bucket CORS settings per bucket

## Input Model

The stack now uses a named-instance map:

```hcl
default_instance = "uploads"

storage_instances = {
  uploads = {
    bucket_name        = "my-project-dev-app-uploads"
    service_account_id = "storage-uploads-sa"
  }
  avatars = {
    bucket_name        = "my-project-dev-user-avatars"
    service_account_id = "storage-avatars-sa"
  }
}
```

Recommended bucket naming:

- `uploads`: `${project_id}-${env}-app-uploads`
- `avatars`: `${project_id}-${env}-user-avatars`

This keeps the bucket purpose obvious in both GCP and application metadata.

## Application Configuration

This stack now outputs API-ready environment variables for the storage module instead of the old single-bucket `S3_*` snippet.

Example output shape:

```bash
STORAGE_PROVIDER=s3
STORAGE_DEFAULT_INSTANCE=uploads
STORAGE_INSTANCES=uploads,avatars

STORAGE_UPLOADS_DEFAULT_BUCKET=my-gcp-project-id-dev-app-uploads
STORAGE_UPLOADS_S3_ENDPOINT=https://storage.googleapis.com
STORAGE_UPLOADS_S3_REGION=us-central1
STORAGE_UPLOADS_S3_ACCESS_KEY_ID=GOOGTS...
STORAGE_UPLOADS_S3_SECRET_ACCESS_KEY=...
STORAGE_UPLOADS_S3_FORCE_PATH_STYLE=false

STORAGE_AVATARS_DEFAULT_BUCKET=my-gcp-project-id-dev-user-avatars
STORAGE_AVATARS_S3_ENDPOINT=https://storage.googleapis.com
STORAGE_AVATARS_S3_REGION=us-central1
STORAGE_AVATARS_S3_ACCESS_KEY_ID=GOOGTS...
STORAGE_AVATARS_S3_SECRET_ACCESS_KEY=...
STORAGE_AVATARS_S3_FORCE_PATH_STYLE=false
```

This matches the API's named storage routing contract for `uploads` and `avatars`.

## Useful Customization

Restrict CORS for a specific instance:

```hcl
storage_instances = {
  uploads = {
    bucket_name        = "my-project-dev-app-uploads"
    service_account_id = "storage-uploads-sa"
    cors_origins = [
      "http://localhost:3000",
      "https://app.example.com",
    ]
  }
  avatars = {
    bucket_name               = "my-project-dev-user-avatars"
    service_account_id        = "storage-avatars-sa"
    cors_origins              = ["https://app.example.com"]
    cors_methods              = ["GET", "HEAD"]
    lifecycle_delete_age_days = 0
  }
}
```

Automatic object cleanup for uploads only:

```hcl
storage_instances = {
  uploads = {
    bucket_name               = "my-project-dev-app-uploads"
    service_account_id        = "storage-uploads-sa"
    lifecycle_delete_age_days = 30
  }
  avatars = {
    bucket_name        = "my-project-dev-user-avatars"
    service_account_id = "storage-avatars-sa"
  }
}
```

## Verification

After `terraform apply`, verify both buckets and both service accounts:

```bash
gcloud storage buckets describe gs://UPLOADS_BUCKET --project=PROJECT_ID
gcloud storage buckets describe gs://AVATARS_BUCKET --project=PROJECT_ID

gcloud storage ls gs://UPLOADS_BUCKET
gcloud storage ls gs://AVATARS_BUCKET

gcloud storage buckets get-iam-policy gs://UPLOADS_BUCKET --project=PROJECT_ID
gcloud storage buckets get-iam-policy gs://AVATARS_BUCKET --project=PROJECT_ID

gcloud storage hmac list --project=PROJECT_ID --service-account=UPLOADS_SERVICE_ACCOUNT_EMAIL
gcloud storage hmac list --project=PROJECT_ID --service-account=AVATARS_SERVICE_ACCOUNT_EMAIL
```
