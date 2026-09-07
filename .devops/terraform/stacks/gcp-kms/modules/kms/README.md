# GCP KMS Module

A reusable Terraform module for creating GCP Cloud KMS infrastructure including key rings, crypto keys, service accounts, and IAM bindings.

## Usage

```hcl
module "kms" {
  source = "../../modules/kms"

  project_id = "my-gcp-project-id"
  location   = "global"
  key_ring_id = "app-encryption-keys"

  crypto_keys = {
    primary = {
      key_id             = "primary-encryption-key"
      rotation_period    = "7776000s"  # 90 days
      algorithm          = "GOOGLE_SYMMETRIC_ENCRYPTION"
      protection_level   = "SOFTWARE"
      destruction_delay  = "24h"
    }
    secondary = {
      key_id             = "secondary-encryption-key"
      rotation_period    = "7776000s"
      algorithm          = "GOOGLE_SYMMETRIC_ENCRYPTION"
      protection_level   = "SOFTWARE"
      destruction_delay  = "24h"
    }
  }

  labels = {
    environment = "prod"
    managed-by  = "terraform"
  }

  create_service_account = true
  service_account_id     = "kms-accessor"

  encrypter_decrypter_members = [
    "serviceAccount:app-sa@project.iam.gserviceaccount.com"
  ]

  admin_members = [
    "user:admin@example.com"
  ]
}
```

## Inputs

| Name                          | Description                         | Type              | Default          | Required |
| ----------------------------- | ----------------------------------- | ----------------- | ---------------- | -------- |
| `project_id`                  | The GCP project ID                  | `string`          | n/a              | yes      |
| `location`                    | The location for the KMS Key Ring   | `string`          | `"global"`       | no       |
| `key_ring_id`                 | The ID of the KMS Key Ring          | `string`          | n/a              | yes      |
| `crypto_keys`                 | Map of crypto keys to create        | `map(object({}))` | n/a              | yes      |
| `labels`                      | Labels to apply to KMS resources    | `map(string)`     | `{}`             | no       |
| `create_service_account`      | Whether to create a service account | `bool`            | `true`           | no       |
| `service_account_id`          | The service account ID              | `string`          | `"kms-accessor"` | no       |
| `encrypter_decrypter_members` | IAM members for encrypt/decrypt     | `list(string)`    | `[]`             | no       |
| `viewer_members`              | IAM members for viewer access       | `list(string)`    | `[]`             | no       |
| `admin_members`               | IAM members for admin access        | `list(string)`    | `[]`             | no       |

## Outputs

| Name                    | Description                             |
| ----------------------- | --------------------------------------- |
| `key_ring_id`           | The ID of the KMS Key Ring              |
| `key_ring_name`         | The name of the KMS Key Ring            |
| `crypto_keys`           | Map of created crypto keys              |
| `service_account_email` | The email of the service account        |
| `service_account_name`  | The name of the service account         |
| `kms_resource_paths`    | Full resource paths for all crypto keys |

## Examples

### Single Key with Service Account

```hcl
module "kms" {
  source = "../../modules/kms"

  project_id  = "my-project"
  location    = "global"
  key_ring_id = "my-keys"

  crypto_keys = {
    main = {
      key_id            = "main-key"
      rotation_period   = "7776000s"
      algorithm         = "GOOGLE_SYMMETRIC_ENCRYPTION"
      protection_level  = "SOFTWARE"
      destruction_delay = "24h"
    }
  }

  create_service_account = true
  service_account_id     = "kms-sa"
}
```

### Multiple Keys

```hcl
module "kms" {
  source = "../../modules/kms"

  project_id  = "my-project"
  location    = "global"
  key_ring_id = "my-keys"

  crypto_keys = {
    data = {
      key_id            = "data-key"
      rotation_period   = "7776000s"
      algorithm         = "GOOGLE_SYMMETRIC_ENCRYPTION"
      protection_level  = "SOFTWARE"
      destruction_delay = "24h"
    }
    secrets = {
      key_id            = "secrets-key"
      rotation_period   = "2592000s"  # 30 days
      algorithm         = "GOOGLE_SYMMETRIC_ENCRYPTION"
      protection_level  = "HSM"
      destruction_delay = "24h"
    }
  }
}
```

### Existing Service Account

```hcl
module "kms" {
  source = "../../modules/kms"

  project_id  = "my-project"
  location    = "global"
  key_ring_id = "my-keys"

  crypto_keys = {
    main = {
      key_id            = "main-key"
      rotation_period   = "7776000s"
      algorithm         = "GOOGLE_SYMMETRIC_ENCRYPTION"
      protection_level  = "SOFTWARE"
      destruction_delay = "24h"
    }
  }

  create_service_account = false

  encrypter_decrypter_members = [
    "serviceAccount:existing-sa@project.iam.gserviceaccount.com"
  ]
}
```

## Requirements

| Name      | Version  |
| --------- | -------- |
| terraform | >= 1.5.0 |
| google    | ~> 5.0   |
