# GCP Identity Platform Infrastructure - Terraform Configuration

This Terraform configuration provisions the project-level Google Cloud Identity Platform baseline used by the repo's `google-identity-platform` auth provider. It enables Identity Platform, creates a Firebase Admin service account, provisions an API key for client flows, and can optionally create a default tenant.

## Overview

The infrastructure created by this configuration includes:

- **Identity Platform project config** with email/password sign-in controls
- **Authorized domains** for hosted auth redirects
- **Firebase Admin service account** for server-side user and token administration
- **Restricted API key** for client-side Identity Platform SDK usage
- **Optional default tenant** for multi-tenant auth setups

## Prerequisites

Required tools:

- Terraform >= 1.5.0
- Google Cloud SDK (`gcloud`)

Required permissions for the account running Terraform:

- `roles/serviceusage.serviceUsageConsumer`
- `roles/serviceusage.serviceUsageAdmin`
- `roles/iam.serviceAccountAdmin`
- `roles/iam.serviceAccountKeyAdmin` if `create_service_account_key = true`
- `roles/resourcemanager.projectIamAdmin`
- `roles/identityplatform.admin` or equivalent project owner/editor access

Authenticate with Application Default Credentials:

```bash
gcloud auth application-default login
```

Set the ADC quota project before running Terraform locally:

```bash
gcloud config set project PROJECT_ID
gcloud auth application-default set-quota-project PROJECT_ID
```

Identity Platform and API Keys commonly return a 403 without this.
This stack also configures the Google provider with
`user_project_override = true` and `billing_project = var.project_id`.

## Quick Start

1. Bootstrap environment config from the shared Terraform Makefile:

```bash
make -C .. bootstrap ENV=dev PROJECT_ID=my-gcp-project-id
```

That generates `../environments/dev/gcp-identity.tfvars`.

2. The equivalent tfvars content looks like:

```hcl
project_id = "my-gcp-project-id"
authorized_domains = [
  "localhost",
  "app.example.com"
]
create_api_key = true
create_service_account_key = false
enable_multi_tenant      = true
```

3. Enable required APIs if they are not already enabled:

```bash
gcloud services enable \
  identitytoolkit.googleapis.com \
  firebase.googleapis.com \
  apikeys.googleapis.com \
  iam.googleapis.com \
  serviceusage.googleapis.com \
  --project=my-gcp-project-id
```

If Terraform fails with `USER_PROJECT_DENIED` or `serviceusage.services.use`, the runner identity is missing baseline project access. Grant the identity running Terraform:

```bash
gcloud projects add-iam-policy-binding my-gcp-project-id \
  --member="user:YOUR_EMAIL" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

If you are running Terraform with a service account, use:

```bash
gcloud projects add-iam-policy-binding my-gcp-project-id \
  --member="serviceAccount:TERRAFORM_RUNNER_SA_EMAIL" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

4. Initialize and apply:

```bash
make -C .. init ENV=dev STACK=gcp-identity
make -C .. plan ENV=dev STACK=gcp-identity
make -C .. apply ENV=dev STACK=gcp-identity
```

After apply, retrieve the values the application needs with:

```bash
terraform output app_env_config
terraform output -raw identity_platform_api_key
terraform output -json app_env_config_sensitive
```

To print the exact PEM private key value the API expects:

```bash
terraform output -raw service_account_private_key
```

If you create a Firebase Admin service-account key and want the full JSON credentials payload directly:

```bash
terraform output -raw firebase_credentials_json
```

Important:

- `firebase_credentials_json` is a full service-account JSON blob for secret-manager style storage.
- `service_account_private_key` and `app_env_config_sensitive.FIREBASE_PRIVATE_KEY` now expose the decoded PEM private key that the app expects.
- This repo's auth provider expects `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` as separate env vars.

## What This Stack Configures

Project-level Identity Platform:

- Enables email/password auth by default
- Disables anonymous auth by default
- Registers authorized domains
- Allows tenant creation only when configured

Application identity:

- Creates a Firebase Admin service account
- Grants `roles/firebaseauth.admin`
- Optionally creates a service account key for non-GCP runtimes

Client identity:

- Creates an API key restricted to `identitytoolkit.googleapis.com`
- Exposes it as `FIREBASE_API_KEY`

Optional tenant:

- Creates a default tenant when `create_default_tenant = true`
- Outputs `FIREBASE_TENANT_ID`

## Application Configuration

This repo's auth provider reads the following environment variables:

```bash
GOOGLE_CLOUD_PROJECT_ID=my-gcp-project-id
FIREBASE_PROJECT_ID=my-gcp-project-id
FIREBASE_API_KEY=AIza...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@my-gcp-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_TENANT_ID=optional-tenant-id
```

Important notes:

- `FIREBASE_API_KEY` is optional in code, but it should be set when you use Identity Platform client or browser flows. This stack provisions it, so the default recommendation is to inject it.
- `FIREBASE_PRIVATE_KEY` is only needed when you are not relying on ADC or Workload Identity.
- `FIREBASE_TENANT_ID` is optional unless you are running tenant-aware auth flows.
- `FIREBASE_CLIENT_ID` and `FIREBASE_CLIENT_SECRET` are not provisioned here because they depend on separately managed OAuth client setup.
- Local ADC users should always run `gcloud auth application-default set-quota-project <project-id>` before `terraform plan` or `terraform apply`.
- For direct env injection, prefer:
  - `terraform output -raw firebase_admin_service_account_email`
  - `terraform output -raw service_account_private_key`
  - `terraform output -raw identity_platform_api_key`

## Makefile Commands

This stack is managed through the shared top-level Makefile:

```bash
make -C .. init ENV=dev STACK=gcp-identity
make -C .. validate ENV=dev STACK=gcp-identity
make -C .. fmt
make -C .. plan ENV=dev STACK=gcp-identity
make -C .. apply ENV=dev STACK=gcp-identity
make -C .. outputs ENV=dev STACK=gcp-identity
```

## Multi-Tenancy

Identity Platform tenants are optional in this stack.

- Multi-tenancy is enabled by default so tenant creation works out of the box.
- Set `create_default_tenant = true` to provision a starter tenant and output `tenant_id`.

The app can run without a tenant if you are using single-project auth.

## Verification

After `terraform apply`, verify the baseline:

```bash
gcloud services list --enabled --project=PROJECT_ID | rg 'identitytoolkit|firebase|apikeys|iam'

gcloud iam service-accounts describe FIREBASE_ADMIN_SA_EMAIL \
  --project=PROJECT_ID

gcloud projects get-iam-policy PROJECT_ID \
  --flatten='bindings[].members' \
  --filter='bindings.role:roles/firebaseauth.admin'
```

If Terraform returns a 403 mentioning `requires a quota project`, retry:

```bash
gcloud config set project PROJECT_ID
gcloud auth application-default set-quota-project PROJECT_ID
```

## References

- Google Identity Platform provider docs in the repo: [`packages/auth/docs/google-identity-platform.md`](../../../../packages/auth/docs/google-identity-platform.md)
- Auth configuration helper: [`packages/auth/src/config/auth-config.ts`](../../../../packages/auth/src/config/auth-config.ts)
