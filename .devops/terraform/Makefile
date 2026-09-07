.PHONY: help bootstrap bootstrap-dev bootstrap-main init validate fmt plan plan-all apply outputs clean

ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
STACKS_DIR := $(ROOT_DIR)stacks
ENVIRONMENTS_DIR := $(ROOT_DIR)environments
SCRIPTS_DIR := $(ROOT_DIR)scripts
STACKS := gcp-kms gcp-identity gcp-storage
ENV ?= dev
STACK ?=
WORKSPACE ?= $(if $(filter dev,$(ENV)),default,$(ENV))

define terraform_init_and_select_workspace
	@terraform -chdir="$(STACKS_DIR)/$(1)" init
	@if terraform -chdir="$(STACKS_DIR)/$(1)" workspace select "$(WORKSPACE)" >/dev/null 2>&1; then \
		echo "Using Terraform workspace '$(WORKSPACE)' for $(1)"; \
	else \
		echo "Creating Terraform workspace '$(WORKSPACE)' for $(1)"; \
		terraform -chdir="$(STACKS_DIR)/$(1)" workspace new "$(WORKSPACE)" >/dev/null; \
	fi
endef

help:
	@echo "Terraform orchestration"
	@echo ""
	@echo "Required variables:"
	@echo "  ENV=<dev|main>               Environment directory to use (default: dev)"
	@echo "  PROJECT_ID=<gcp-project-id>  Required for bootstrap targets"
	@echo "  STACK=<stack-name>           Required for stack-specific targets"
	@echo "  WORKSPACE=<name>             Optional Terraform workspace override"
	@echo ""
	@echo "Main targets:"
	@echo "  make bootstrap ENV=dev PROJECT_ID=my-dev-project"
	@echo "  make bootstrap ENV=main PROJECT_ID=my-prod-project"
	@echo "  make init STACK=gcp-kms ENV=dev"
	@echo "  make validate STACK=gcp-identity ENV=dev"
	@echo "  make plan STACK=gcp-kms ENV=dev"
	@echo "  make plan-all ENV=dev"
	@echo "  make apply STACK=gcp-identity ENV=main"
	@echo "  make outputs STACK=gcp-storage ENV=main"
	@echo "  make clean STACK=gcp-kms ENV=dev"
	@echo ""
	@echo "Optional bootstrap overrides:"
	@echo "  REGION=us-central1"
	@echo "  ZONE=us-central1-a"
	@echo "  IDENTITY_AUTHORIZED_DOMAINS=localhost,app.example.com"
	@echo "  STORAGE_CORS_ORIGINS=http://localhost:3000,https://app.example.com"
	@echo ""
	@echo "Workspace mapping:"
	@echo "  ENV=dev  -> workspace=default"
	@echo "  ENV=main -> workspace=main"
	@echo ""
	@echo "Available stacks: $(STACKS)"

bootstrap:
	@test -n "$(PROJECT_ID)" || (echo "PROJECT_ID is required. Example: make bootstrap ENV=dev PROJECT_ID=my-project" && exit 1)
	@$(SCRIPTS_DIR)/render-tfvars.sh "$(ENV)" "$(PROJECT_ID)" "$(REGION)" "$(ZONE)" "$(IDENTITY_AUTHORIZED_DOMAINS)" "$(STORAGE_CORS_ORIGINS)"

bootstrap-dev:
	@$(MAKE) bootstrap ENV=dev PROJECT_ID="$(PROJECT_ID)" REGION="$(REGION)" ZONE="$(ZONE)" IDENTITY_AUTHORIZED_DOMAINS="$(IDENTITY_AUTHORIZED_DOMAINS)" STORAGE_CORS_ORIGINS="$(STORAGE_CORS_ORIGINS)"

bootstrap-main:
	@$(MAKE) bootstrap ENV=main PROJECT_ID="$(PROJECT_ID)" REGION="$(REGION)" ZONE="$(ZONE)" IDENTITY_AUTHORIZED_DOMAINS="$(IDENTITY_AUTHORIZED_DOMAINS)" STORAGE_CORS_ORIGINS="$(STORAGE_CORS_ORIGINS)"

fmt:
	@terraform -chdir="$(STACKS_DIR)/gcp-kms" fmt -recursive
	@terraform -chdir="$(STACKS_DIR)/gcp-identity" fmt -recursive
	@terraform -chdir="$(STACKS_DIR)/gcp-storage" fmt -recursive

init:
	@test -n "$(STACK)" || (echo "STACK is required. Available stacks: $(STACKS)" && exit 1)
	$(call terraform_init_and_select_workspace,$(STACK))

validate:
	@test -n "$(STACK)" || (echo "STACK is required. Available stacks: $(STACKS)" && exit 1)
	@test -f "$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfvars" || (echo "Missing $(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfvars. Run make bootstrap ENV=$(ENV) PROJECT_ID=<gcp-project-id> first." && exit 1)
	$(call terraform_init_and_select_workspace,$(STACK))
	@terraform -chdir="$(STACKS_DIR)/$(STACK)" validate

plan:
	@test -n "$(STACK)" || (echo "STACK is required. Available stacks: $(STACKS)" && exit 1)
	@test -f "$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfvars" || (echo "Missing $(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfvars. Run make bootstrap ENV=$(ENV) PROJECT_ID=<gcp-project-id> first." && exit 1)
	$(call terraform_init_and_select_workspace,$(STACK))
	@terraform -chdir="$(STACKS_DIR)/$(STACK)" plan -var-file="$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfvars" -out="$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfplan"

plan-all:
	@for stack in $(STACKS); do \
		echo "==> $$stack ($(ENV))"; \
		test -f "$(ENVIRONMENTS_DIR)/$(ENV)/$$stack.tfvars" || { echo "Missing $(ENVIRONMENTS_DIR)/$(ENV)/$$stack.tfvars. Run make bootstrap ENV=$(ENV) PROJECT_ID=<gcp-project-id> first."; exit 1; }; \
		terraform -chdir="$(STACKS_DIR)/$$stack" init >/dev/null || exit $$?; \
		if terraform -chdir="$(STACKS_DIR)/$$stack" workspace select "$(WORKSPACE)" >/dev/null 2>&1; then \
			echo "Using Terraform workspace '$(WORKSPACE)' for $$stack"; \
		else \
			echo "Creating Terraform workspace '$(WORKSPACE)' for $$stack"; \
			terraform -chdir="$(STACKS_DIR)/$$stack" workspace new "$(WORKSPACE)" >/dev/null || exit $$?; \
		fi; \
		terraform -chdir="$(STACKS_DIR)/$$stack" plan -var-file="$(ENVIRONMENTS_DIR)/$(ENV)/$$stack.tfvars" -out="$(ENVIRONMENTS_DIR)/$(ENV)/$$stack.tfplan" || exit $$?; \
		echo ""; \
	done

apply:
	@test -n "$(STACK)" || (echo "STACK is required. Available stacks: $(STACKS)" && exit 1)
	@test -f "$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfvars" || (echo "Missing $(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfvars. Run make bootstrap ENV=$(ENV) PROJECT_ID=<gcp-project-id> first." && exit 1)
	$(call terraform_init_and_select_workspace,$(STACK))
	@if [ -f "$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfplan" ]; then \
		terraform -chdir="$(STACKS_DIR)/$(STACK)" apply "$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfplan"; \
	else \
		terraform -chdir="$(STACKS_DIR)/$(STACK)" apply -var-file="$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfvars"; \
	fi

outputs:
	@test -n "$(STACK)" || (echo "STACK is required. Available stacks: $(STACKS)" && exit 1)
	$(call terraform_init_and_select_workspace,$(STACK))
	@terraform -chdir="$(STACKS_DIR)/$(STACK)" output

clean:
	@test -n "$(STACK)" || (echo "STACK is required. Available stacks: $(STACKS)" && exit 1)
	@rm -f "$(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfplan"
	@echo "Removed $(ENVIRONMENTS_DIR)/$(ENV)/$(STACK).tfplan"
