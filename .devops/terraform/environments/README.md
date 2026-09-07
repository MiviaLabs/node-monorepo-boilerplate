# Environment configs

This directory holds generated environment-specific Terraform inputs and plan artifacts.

- `dev/`: local or shared development configuration
- `main/`: production-like configuration aligned with the `main` branch name

Generated files:

- `<stack>.tfvars`
- `<stack>.tfplan`

Current stacks:

- `gcp-kms`
- `gcp-identity`
- `gcp-storage`

Generate them with:

```bash
make -C .devops/terraform bootstrap ENV=dev PROJECT_ID=my-dev-project
make -C .devops/terraform bootstrap ENV=main PROJECT_ID=my-prod-project
```

Workspace mapping for stack state:

- `dev` uses the Terraform `default` workspace
- `main` uses the Terraform `main` workspace
