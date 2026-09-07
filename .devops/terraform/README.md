# Terraform orchestration

This directory now separates reusable Terraform stacks from environment-specific configuration:

- `stacks/`: Terraform roots for each infrastructure concern
- `environments/dev/`: generated `dev` tfvars and plan files
- `environments/main/`: generated `main` tfvars and plan files
- `scripts/`: helper scripts used by the top-level Makefile

Current stack roles:

- `gcp-kms`: encryption key management
- `gcp-identity`: Google Identity Platform baseline
- `gcp-storage`: private GCS buckets for the API's named `uploads` and `avatars` storage instances, with S3-compatible access via HMAC credentials

`main` is the production-like environment directory name so it matches the repo's branch naming.
Inside Terraform inputs it maps to `environment = "prod"` because the current stacks validate
against `dev|staging|prod`.

Workspace behavior:

- `ENV=dev` uses the Terraform `default` workspace.
- `ENV=main` uses a dedicated Terraform `main` workspace.
- The shared Makefile now auto-selects or creates the correct workspace before `plan`, `apply`, and `outputs`.

## Layout

```text
.devops/terraform/
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

## Bootstrap a new environment

Generate stack-specific tfvars from a single GCP project id:

```bash
make -C .devops/terraform bootstrap ENV=dev PROJECT_ID=my-dev-project
make -C .devops/terraform bootstrap ENV=main PROJECT_ID=my-prod-project
```

Optional overrides:

```bash
make -C .devops/terraform bootstrap \
  ENV=main \
  PROJECT_ID=my-prod-project \
  REGION=us-central1 \
  ZONE=us-central1-a \
  IDENTITY_AUTHORIZED_DOMAINS=app.example.com,admin.example.com \
  STORAGE_CORS_ORIGINS=http://localhost:3000,https://app.example.com
```

This generates:

- `environments/<env>/gcp-kms.tfvars`
- `environments/<env>/gcp-identity.tfvars`
- `environments/<env>/gcp-storage.tfvars`

The generated `gcp-storage.tfvars` now provisions two named storage instances:

- `uploads`
- `avatars`

With default bucket naming:

- `${project_id}-${env}-app-uploads`
- `${project_id}-${env}-user-avatars`

## Common workflows

Format all stacks:

```bash
make -C .devops/terraform fmt
```

Initialize a stack:

```bash
make -C .devops/terraform init ENV=dev STACK=gcp-kms
```

Validate or plan one stack:

```bash
make -C .devops/terraform validate ENV=dev STACK=gcp-identity
make -C .devops/terraform plan ENV=dev STACK=gcp-kms
make -C .devops/terraform plan ENV=dev STACK=gcp-storage
```

Prepare plans for all stacks in one environment:

```bash
make -C .devops/terraform plan-all ENV=dev
make -C .devops/terraform plan-all ENV=main
```

Apply or inspect outputs:

```bash
make -C .devops/terraform apply ENV=main STACK=gcp-identity
make -C .devops/terraform outputs ENV=main STACK=gcp-storage
```

## Notes

- The generated `.tfvars` files are intentionally gitignored.
- Each stack keeps its own Terraform state and provider initialization under `stacks/`, split by workspace.
- If you later introduce remote state, configure it per stack in `stacks/*/versions.tf`.
- `gcp-storage` outputs API-ready `STORAGE_*` environment variables that match `apps/api` named storage routing rather than the older single-bucket `S3_*` shape.
- When running Terraform locally against GCP APIs with `user_project_override`, the runner identity must already have baseline project IAM, especially `roles/serviceusage.serviceUsageConsumer`, before Terraform can manage higher-level resources.
