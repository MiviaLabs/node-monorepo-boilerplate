# GCP KMS Infrastructure - Terraform Configuration

This Terraform configuration creates a complete GCP Cloud Key Management Service (KMS) infrastructure for encryption key management. It includes key rings, crypto keys with automatic rotation, service accounts, and IAM bindings for secure application access.

## Overview

The infrastructure created by this configuration includes:

- **KMS Key Ring**: A container for cryptographic keys in a specific location
- **Crypto Key**: The actual encryption key with automatic rotation (90-day default)
- **Service Account**: Dedicated service account for application KMS access
- **IAM Bindings**: Proper permissions for encrypt/decrypt and viewer operations
- **Audit Logging**: Cloud Audit Logs enabled for compliance and security monitoring

## Prerequisites

### Required Tools

- [Terraform](https://www.terraform.io/downloads.html) >= 1.5.0
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (gcloud CLI)
- [gcloud terraform provider](https://registry.terraform.io/providers/hashicorp/google/latest)

### Required Permissions

The account running Terraform needs the following IAM roles:

- `roles/cloudkms.admin` - To create and manage KMS resources
- `roles/iam.serviceAccountAdmin` - To create service accounts
- `roles/iam.serviceAccountKeyAdmin` - If creating service account keys
- `roles/resourcemanager.projectIamAdmin` - To configure audit logging
- `roles/compute.viewer` - For region/zone validation

### GCP Authentication

Authenticate using one of these methods:

#### Method 1: Application Default Credentials (ADC) - Recommended

```bash
# Authenticate using your user account
gcloud auth application-default login

# Or use a service account
gcloud auth application-default login \
  --impersonate-service-account=kms-accessor-sa@PROJECT_ID.iam.gserviceaccount.com
```

#### Method 2: Service Account Key

```bash
# Set the path to your service account key
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

#### Method 3: Workload Identity (GKE/GCE)

For GKE or GCE instances, configure Workload Identity:

```bash
# Allow the Kubernetes service account to impersonate the GCP service account
gcloud iam service-accounts add-iam-policy-binding kms-accessor-sa@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:PROJECT_ID.svc.id.goog[namespace/kubernetes-service-account]"
```

## Quick Start

### 1. Generate Environment Config

Bootstrap environment config from the shared Terraform Makefile:

```bash
make -C .. bootstrap ENV=dev PROJECT_ID=my-gcp-project-id
```

That generates `../environments/dev/gcp-kms.tfvars`.

The equivalent tfvars content looks like:

```hcl
project_id    = "my-gcp-project-id"
location      = "global"
environment   = "dev"
key_ring_id   = "app-encryption-keys"
key_id        = "primary-encryption-key"
```

### 2. Initialize Terraform

```bash
make -C .. init ENV=dev STACK=gcp-kms
```

### 3. Review the Execution Plan

```bash
make -C .. plan ENV=dev STACK=gcp-kms
```

This will show all resources that will be created. Review carefully before proceeding.

### 4. Apply the Configuration

```bash
make -C .. apply ENV=dev STACK=gcp-kms
```

Type `yes` when prompted. Terraform will create all resources and display the outputs.

### 5. Save the Outputs

After successful apply, Terraform will display outputs like:

```
service_account_email = "kms-accessor-sa@my-project.iam.gserviceaccount.com"
key_ring_id = "app-encryption-keys"
crypto_key_id = "primary-encryption-key"
kms_key_resource_path = "projects/my-project/locations/global/keyRings/app-encryption-keys/cryptoKeys/primary-encryption-key"
```

**Save these values!** You'll need them to configure your application.

## Configuration

### State Backend (Optional)

For team collaboration, configure a remote backend. Edit `main.tf` and uncomment:

```hcl
terraform {
  backend "gcs" {
    bucket = "your-terraform-state-bucket"
    prefix = "terraform/gcp-kms"
  }
}
```

Then create the bucket:

```bash
gsutil mb -p my-gcp-project-id gs://your-terraform-state-bucket
```

### Key Rotation

By default, keys rotate every 90 days. To customize:

```hcl
rotation_period = "2592000s"  # 30 days
```

### Service Account Key Creation

**WARNING**: Creating service account keys is a security risk. Use Workload Identity for GKE/GCE when possible.

If you must create a key (e.g., for AWS, Azure, or on-prem):

```hcl
create_service_account_key = true
```

After applying, `make -C .. outputs ENV=<env> STACK=gcp-kms` will expose:

- `gcp_credentials_base64`
- `app_env_config_sensitive.GCP_CREDENTIALS_BASE64`

Both values are the base64-encoded Google credentials JSON suitable for `GCP_CREDENTIALS_BASE64`. Store it securely in a secrets manager.

To print the raw value directly:

```bash
terraform -chdir=.devops/terraform/stacks/gcp-kms output -raw gcp_credentials_base64
```

### IAM Configuration

Grant additional users or service accounts access:

```hcl
additional_iam_members = [
  "user:admin@example.com",
  "serviceAccount:app-sa@project.iam.gserviceaccount.com"
]
```

### Single-Key Architecture

**IMPORTANT**: This project uses a SINGLE primary encryption key (`primary-encryption-key`)
shared across all tenants. The old per-tenant key pattern (`tenant-{tenantId}`) has been
deprecated.

Tenant isolation is maintained through:

- **DEKs (Data Encryption Keys)**: Each vault entry has a unique DEK
- **KEK (Key Encryption Key)**: The GCP KMS key wraps the DEKs
- **Envelope Encryption**: KEK encrypts DEKs, DEKs encrypt data

This architecture provides:

- **Cost Efficiency**: $1/month vs $1M+/month for 1M tenant-specific keys
- **Operational Simplicity**: One key to manage, monitor, and rotate
- **Security**: Tenant isolation is NOT compromised (unique DEKs per entry)

Grant admin access to the key ring:

```hcl
admin_iam_members = [
  "user:security-admin@example.com"
]
```

## Application Configuration

### Environment Variables

Configure your application with these environment variables:

```bash
# Required - Single Primary Key Configuration
GCP_PROJECT_ID=my-gcp-project-id
GCP_LOCATION_ID=global
GCP_KEY_RING_ID=app-encryption-keys
GCP_KEY_ID=primary-encryption-key  # Single key for all tenants

# IMPORTANT: GCP_KEY_ID must be 'primary-encryption-key' (not 'tenant-{id}')
# This single key is shared across all tenants via envelope encryption.

# Optional: Service account email (for ADC or Workload Identity)
GCP_SERVICE_ACCOUNT_EMAIL=kms-accessor-sa@my-gcp-project-id.iam.gserviceaccount.com

# Optional: Service account key (only if using key-based auth)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Optional: Base64-encoded service account JSON (only if create_service_account_key = true)
GCP_CREDENTIALS_BASE64=...
```

### TypeScript/Node.js Usage

```typescript
import { createGcpKmsProvider } from '@package/encryption';

const kmsProvider = createGcpKmsProvider({
  projectId: process.env.GCP_PROJECT_ID,
  locationId: process.env.GCP_LOCATION_ID,
  keyRingId: process.env.GCP_KEY_RING_ID,
  keyId: process.env.GCP_KEY_ID
});

// Encrypt data
const encrypted = await kmsProvider.encrypt(sensitiveData);

// Decrypt data
const decrypted = await kmsProvider.decrypt(encrypted);
```

## Operations

### View Key Versions

```bash
gcloud kms keys versions list primary-encryption-key \
  --location=global \
  --keyring=app-encryption-keys \
  --project=my-gcp-project-id
```

### Manual Key Rotation

```bash
gcloud kms keys rotate primary-encryption-key \
  --location=global \
  --keyring=app-encryption-keys \
  --project=my-gcp-project-id
```

### View IAM Policy

```bash
gcloud kms keys get-iam-policy primary-encryption-key \
  --location=global \
  --keyring=app-encryption-keys \
  --project=my-gcp-project-id
```

### Grant Additional Access

```bash
gcloud kms keys add-iam-policy-binding primary-encryption-key \
  --location=global \
  --keyring=app-encryption-keys \
  --member='user:new-user@example.com' \
  --role='roles/cloudkms.cryptoKeyEncrypterDecrypter' \
  --project=my-gcp-project-id
```

## Security Best Practices

### 1. Use Workload Identity

Prefer Workload Identity over service account keys for GKE/GCE:

```hcl
# In your GKE node pool configuration
node_config {
  workload_metadata_config {
    mode = "GKE_METADATA"
  }
}
```

### 2. Enable Audit Logging

Audit logging is enabled by default. Set up log-based alerts:

```bash
# Create a sink for KMS audit logs
gcloud logging sinks create kms-audit-sink \
  bigquery.googleapis.com/projects/my-project/datasets/kms_audit \
  --log-filter='protoPayload.serviceName="cloudkms.googleapis.com"'
```

### 3. Regular Access Reviews

Periodically review and audit who has access to your keys:

```bash
# List all IAM members
gcloud kms keys get-iam-policy primary-encryption-key \
  --location=global \
  --keyring=app-encryption-keys \
  --project=my-gcp-project-id
```

### 4. Monitor Key Health

Set up Cloud Monitoring dashboards for:

- Failed decrypt operations (may indicate attacks)
- Key rotation events
- Unusual access patterns

### 5. Key Destruction Safety

The default key destruction delay is 24 hours. This gives you time to recover from accidental deletions. Do not reduce this value.

## Troubleshooting

### Permission Denied

If you get permission errors:

```bash
# Verify your authentication
gcloud auth list

# Check your IAM roles
gcloud projects get-iam-policy my-gcp-project-id \
  --filter="bindings.members:user:your-email@example.com"
```

### State Lock Issues

If Terraform state is locked:

```bash
# Force unlock (use with caution)
terraform force-unlock <LOCK_ID>
```

### Provider Version Issues

If you get provider errors:

```bash
# Upgrade the provider
terraform init -upgrade
```

## Maintenance

### Upgrading Terraform Configuration

```bash
# Pull latest changes
git pull

# Review changes
terraform plan

# Apply if no issues
terraform apply
```

### Changing Key Rotation Period

**Note**: This change applies to future rotations, not the current schedule.

```hcl
rotation_period = "2592000s"  # 30 days
```

## Destroying Resources

To destroy all resources:

```bash
terraform destroy
```

**Warning**: This will permanently delete the key ring, all keys, and the service account. Ensure you have no encrypted data using these keys before destroying.

## Cost Estimates

GCP KMS pricing (as of 2024):

- **Key Ring**: Free
- **Crypto Key**: ~$1.00 per month per key version
- **Operations**:
  - Encrypt/Decrypt: $0.00003 per operation
  - Key management: $0.00003 per operation

For a typical application with 100,000 operations/month:

- **Estimated cost**: $3-5/month

See [GCP KMS Pricing](https://cloud.google.com/kms/pricing) for details.

## Further Reading

- [GCP KMS Documentation](https://cloud.google.com/kms/docs)
- [Terraform Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/kms_key_ring)
- [Encryption Package Documentation](../../../../packages/encryption/README.md)
- [Security Best Practices](../../../../.agents/governance/core-guardrails.md)

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review GCP KMS documentation
3. Contact your platform/DevOps team
