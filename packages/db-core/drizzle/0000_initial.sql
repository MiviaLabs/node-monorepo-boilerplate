CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"key_hash" varchar(255) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"last_used_ip" varchar(45),
	"usage_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "content_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"content_entry_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"attached_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "content_attachments_attached_by_positive_chk" CHECK ("content_attachments"."attached_by_user_id" > 0)
);
--> statement-breakpoint
CREATE TABLE "content_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"content_entry_id" integer NOT NULL,
	"author_user_id" integer NOT NULL,
	"body_markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "content_comments_body_not_blank_chk" CHECK (btrim("content_comments"."body_markdown") <> '')
);
--> statement-breakpoint
CREATE TABLE "content_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"parent_id" integer,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"content_markdown" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" integer NOT NULL,
	"updated_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "content_entries_title_not_blank_chk" CHECK (btrim("content_entries"."title") <> ''),
	CONSTRAINT "content_entries_slug_not_blank_chk" CHECK (btrim("content_entries"."slug") <> ''),
	CONSTRAINT "content_entries_position_non_negative_chk" CHECK ("content_entries"."position" >= 0),
	CONSTRAINT "content_entries_parent_not_self_chk" CHECK ("content_entries"."parent_id" is null or "content_entries"."parent_id" <> "content_entries"."id")
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" integer NOT NULL,
	"direction" varchar(16) DEFAULT 'outbound' NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reference_type" varchar(100),
	"reference_id" varchar(255),
	"subject" varchar(998),
	"to_email_hash" varchar(64),
	"from_email_hash" varchar(64),
	"request_id" varchar(255),
	"correlation_id" varchar(255),
	"causation_id" varchar(255),
	"metadata" jsonb,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_provider_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"email_message_id" integer NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_message_id" varchar(255),
	"provider_delivery_id" varchar(255),
	"provider_event_id" varchar(255),
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"provider_status" varchar(64),
	"normalized_status" varchar(64),
	"payload" jsonb,
	"tags_json" jsonb,
	"metadata_json" jsonb,
	"request_id" varchar(255),
	"correlation_id" varchar(255),
	"causation_id" varchar(255),
	"accepted_at" timestamp with time zone,
	"last_webhook_occurred_at" timestamp with time zone,
	"last_webhook_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"email_message_id" integer,
	"email_provider_message_id" integer,
	"provider" varchar(64) NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"provider_event_id" varchar(255),
	"provider_delivery_id" varchar(255),
	"provider_message_id" varchar(255),
	"provider_event_type" varchar(120) NOT NULL,
	"normalized_event_type" varchar(64) NOT NULL,
	"verification_status" varchar(32) DEFAULT 'verified' NOT NULL,
	"processing_status" varchar(32) DEFAULT 'received' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"raw_headers_json" jsonb,
	"tags_json" jsonb,
	"safe_metadata_json" jsonb,
	"raw_body" "bytea" NOT NULL,
	"raw_payload_json" jsonb,
	"content_type" varchar(255),
	"occurred_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" varchar(512),
	"request_id" varchar(255),
	"correlation_id" varchar(255),
	"causation_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encrypted-store_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"entity_type" varchar NOT NULL,
	"entity_id" integer NOT NULL,
	"field_path" varchar(255) NOT NULL,
	"ciphertext" text NOT NULL,
	"encrypted_data_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_id" varchar(255) DEFAULT 'primary-encryption-key' NOT NULL,
	"key_version" varchar(50),
	"classification" varchar NOT NULL,
	"category" varchar NOT NULL,
	"access_log" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"rotated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"uploaded_by_user_id" integer NOT NULL,
	"storage_instance" varchar(64) NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"object_key" varchar(1024) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(255),
	"byte_size" integer NOT NULL,
	"checksum_sha256" varchar(64),
	"etag" varchar(255),
	"status" varchar(32) DEFAULT 'pending_upload' NOT NULL,
	"visibility" varchar(32) DEFAULT 'private' NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_instance_not_blank_chk" CHECK (btrim("files"."storage_instance") <> ''),
	CONSTRAINT "files_bucket_not_blank_chk" CHECK (btrim("files"."bucket") <> ''),
	CONSTRAINT "files_object_key_not_blank_chk" CHECK (btrim("files"."object_key") <> ''),
	CONSTRAINT "files_original_filename_not_blank_chk" CHECK (btrim("files"."original_filename") <> ''),
	CONSTRAINT "files_byte_size_non_negative_chk" CHECK ("files"."byte_size" >= 0),
	CONSTRAINT "files_checksum_sha256_format_chk" CHECK ("files"."checksum_sha256" is null or "files"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "files_deleted_at_requires_upload_state_chk" CHECK ("files"."deleted_at" is null or "files"."uploaded_at" is not null or "files"."status" in ('upload_failed', 'pending_upload'))
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"email_hash" varchar(64),
	"email_encrypted" text,
	"encryption_key_version" varchar(100) NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"role" varchar(50),
	"invited_by_user_id" integer,
	"expires_at" timestamp,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "issue_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"issue_id" integer NOT NULL,
	"actor_user_id" integer,
	"activity_type" varchar(48) NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_assignees" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"assigned_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"issue_id" integer NOT NULL,
	"uploaded_by_user_id" integer NOT NULL,
	"file_id" integer,
	"storage_key" varchar(512) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(255),
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "issue_attachments_storage_key_not_blank_chk" CHECK (btrim("issue_attachments"."storage_key") <> ''),
	CONSTRAINT "issue_attachments_original_filename_not_blank_chk" CHECK (btrim("issue_attachments"."original_filename") <> ''),
	CONSTRAINT "issue_attachments_byte_size_non_negative_chk" CHECK ("issue_attachments"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "issue_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"issue_id" integer NOT NULL,
	"author_user_id" integer NOT NULL,
	"parent_comment_id" integer,
	"body_markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "issue_comments_body_not_blank_chk" CHECK (btrim("issue_comments"."body_markdown") <> ''),
	CONSTRAINT "issue_comments_parent_not_self_chk" CHECK ("issue_comments"."parent_comment_id" is null or "issue_comments"."parent_comment_id" <> "issue_comments"."id")
);
--> statement-breakpoint
CREATE TABLE "issue_label_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"issue_id" integer NOT NULL,
	"label_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"name" varchar(120) NOT NULL,
	"color" varchar(24),
	"description" text,
	"created_by" integer NOT NULL,
	"updated_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "issue_labels_name_not_blank_chk" CHECK (btrim("issue_labels"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "issue_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"source_issue_id" integer NOT NULL,
	"target_issue_id" integer NOT NULL,
	"relation_type" varchar(24) NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_relations_source_target_not_self_chk" CHECK ("issue_relations"."source_issue_id" <> "issue_relations"."target_issue_id")
);
--> statement-breakpoint
CREATE TABLE "issue_watchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"added_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"parent_issue_id" integer,
	"issue_number" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description_markdown" text DEFAULT '' NOT NULL,
	"status" varchar(24) DEFAULT 'backlog' NOT NULL,
	"priority" varchar(16) DEFAULT 'medium' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"estimate" integer,
	"due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_by" integer NOT NULL,
	"updated_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "issues_title_not_blank_chk" CHECK (btrim("issues"."title") <> ''),
	CONSTRAINT "issues_description_not_null_chk" CHECK ("issues"."description_markdown" is not null),
	CONSTRAINT "issues_position_non_negative_chk" CHECK ("issues"."position" >= 0),
	CONSTRAINT "issues_estimate_non_negative_chk" CHECK ("issues"."estimate" is null or "issues"."estimate" >= 0),
	CONSTRAINT "issues_parent_issue_not_self_chk" CHECK ("issues"."parent_issue_id" is null or "issues"."parent_issue_id" <> "issues"."id"),
	CONSTRAINT "issues_resolved_at_status_chk" CHECK ("issues"."resolved_at" is null or "issues"."status" = 'done')
);
--> statement-breakpoint
CREATE TABLE "key_rotation_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"old_key_id" varchar(255) NOT NULL,
	"new_key_id" varchar(255) NOT NULL,
	"status" varchar NOT NULL,
	"total_entries" integer NOT NULL,
	"processed_entries" integer DEFAULT 0 NOT NULL,
	"failed_entries" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"last_cursor" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "kms_rotation_checkpoint" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_name" varchar(255) NOT NULL,
	"last_seen_version" varchar(255) NOT NULL,
	"last_processed_from_version" varchar(255),
	"last_processed_to_version" varchar(255),
	"last_checked_at" timestamp DEFAULT now() NOT NULL,
	"last_rotated_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"owner_id" integer,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"slug" varchar(50) NOT NULL,
	"gcp_tenant_id" varchar(255),
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "organizations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"request_ip" varchar(45),
	"request_user_agent" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"assigned_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"key" varchar(8) NOT NULL,
	"name" varchar(255) NOT NULL,
	"visibility" varchar(16) DEFAULT 'public' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_key_not_blank_chk" CHECK (btrim("projects"."key") <> '')
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar NOT NULL,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"address_type" varchar(50) DEFAULT 'primary' NOT NULL,
	"label" varchar(100),
	"street_encrypted_store_id" integer,
	"street2_encrypted_store_id" integer,
	"city_encrypted_store_id" integer,
	"state_encrypted_store_id" integer,
	"postal_code_encrypted_store_id" integer,
	"country_encrypted_store_id" integer,
	"country_code" varchar(2),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_uid" varchar(255) NOT NULL,
	"provider_email_hash" varchar(64),
	"provider_email_encrypted" text,
	"phone_number_encrypted" text,
	"encryption_key_version" varchar(50) NOT NULL,
	"display_name" varchar(255),
	"photo_url" varchar(500),
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_sign_in_at" timestamp,
	CONSTRAINT "user_id_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "provider_uid_unique" UNIQUE("provider","provider_uid")
);
--> statement-breakpoint
CREATE TABLE "user_organization_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"setting_key" varchar(120) NOT NULL,
	"value_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar NOT NULL,
	"assigned_by" integer,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_role" UNIQUE("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "user_tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"role" varchar DEFAULT 'tenant_user' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_tenant" UNIQUE("user_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"email_hash" varchar(64),
	"email_encrypted" text,
	"first_name_encrypted" text,
	"last_name_encrypted" text,
	"display_name" varchar(255),
	"phone_number_encrypted" text,
	"encryption_key_version" varchar(50) NOT NULL,
	"photo_url" varchar(500),
	"avatar_file_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_sign_in_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_public_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("public_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_attachments" ADD CONSTRAINT "content_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_attachments" ADD CONSTRAINT "content_attachments_content_entry_id_content_entries_id_fk" FOREIGN KEY ("content_entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_attachments" ADD CONSTRAINT "content_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_attachments" ADD CONSTRAINT "content_attachments_attached_by_user_id_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_comments" ADD CONSTRAINT "content_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_comments" ADD CONSTRAINT "content_comments_content_entry_id_content_entries_id_fk" FOREIGN KEY ("content_entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_comments" ADD CONSTRAINT "content_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_parent_id_content_entries_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."content_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_provider_messages" ADD CONSTRAINT "email_provider_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_provider_messages" ADD CONSTRAINT "email_provider_messages_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_webhook_events" ADD CONSTRAINT "email_webhook_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_webhook_events" ADD CONSTRAINT "email_webhook_events_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_webhook_events" ADD CONSTRAINT "email_webhook_events_email_provider_message_id_email_provider_messages_id_fk" FOREIGN KEY ("email_provider_message_id") REFERENCES "public"."email_provider_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted-store_entries" ADD CONSTRAINT "encrypted-store_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_parent_comment_id_issue_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."issue_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_org_fk" FOREIGN KEY ("organization_id","issue_id") REFERENCES "public"."issues"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label_assignments" ADD CONSTRAINT "issue_label_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label_assignments" ADD CONSTRAINT "issue_label_assignments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label_assignments" ADD CONSTRAINT "issue_label_assignments_label_id_issue_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."issue_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label_assignments" ADD CONSTRAINT "issue_label_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label_assignments" ADD CONSTRAINT "issue_label_assignments_issue_org_fk" FOREIGN KEY ("organization_id","issue_id") REFERENCES "public"."issues"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label_assignments" ADD CONSTRAINT "issue_label_assignments_label_org_fk" FOREIGN KEY ("organization_id","label_id") REFERENCES "public"."issue_labels"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_target_issue_id_issues_id_fk" FOREIGN KEY ("target_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_source_issue_org_fk" FOREIGN KEY ("organization_id","source_issue_id") REFERENCES "public"."issues"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_target_issue_org_fk" FOREIGN KEY ("organization_id","target_issue_id") REFERENCES "public"."issues"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchers" ADD CONSTRAINT "issue_watchers_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchers" ADD CONSTRAINT "issue_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchers" ADD CONSTRAINT "issue_watchers_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_issue_id_issues_id_fk" FOREIGN KEY ("parent_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_rotation_state" ADD CONSTRAINT "key_rotation_state_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_street_encrypted_store_id_encrypted-store_entries_id_fk" FOREIGN KEY ("street_encrypted_store_id") REFERENCES "public"."encrypted-store_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_street2_encrypted_store_id_encrypted-store_entries_id_fk" FOREIGN KEY ("street2_encrypted_store_id") REFERENCES "public"."encrypted-store_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_city_encrypted_store_id_encrypted-store_entries_id_fk" FOREIGN KEY ("city_encrypted_store_id") REFERENCES "public"."encrypted-store_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_state_encrypted_store_id_encrypted-store_entries_id_fk" FOREIGN KEY ("state_encrypted_store_id") REFERENCES "public"."encrypted-store_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_postal_code_encrypted_store_id_encrypted-store_entries_id_fk" FOREIGN KEY ("postal_code_encrypted_store_id") REFERENCES "public"."encrypted-store_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_country_encrypted_store_id_encrypted-store_entries_id_fk" FOREIGN KEY ("country_encrypted_store_id") REFERENCES "public"."encrypted-store_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organization_settings" ADD CONSTRAINT "user_organization_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organization_settings" ADD CONSTRAINT "user_organization_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_active_idx" ON "api_keys" USING btree ("is_active","deleted_at");--> statement-breakpoint
CREATE INDEX "api_keys_expires_idx" ON "api_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "api_keys_lookup_idx" ON "api_keys" USING btree ("organization_id","key_hash");--> statement-breakpoint
CREATE INDEX "content_attachments_entry_created_idx" ON "content_attachments" USING btree ("content_entry_id","created_at");--> statement-breakpoint
CREATE INDEX "content_attachments_org_active_idx" ON "content_attachments" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "content_attachments_file_active_idx" ON "content_attachments" USING btree ("organization_id","file_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_attachments_entry_file_active_uidx" ON "content_attachments" USING btree ("organization_id","content_entry_id","file_id") WHERE "content_attachments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "content_comments_entry_created_idx" ON "content_comments" USING btree ("content_entry_id","created_at");--> statement-breakpoint
CREATE INDEX "content_comments_org_active_idx" ON "content_comments" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "content_comments_entry_active_idx" ON "content_comments" USING btree ("organization_id","content_entry_id","deleted_at");--> statement-breakpoint
CREATE INDEX "content_entries_organization_idx" ON "content_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "content_entries_org_project_idx" ON "content_entries" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "content_entries_parent_idx" ON "content_entries" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "content_entries_active_org_idx" ON "content_entries" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "content_entries_active_scope_idx" ON "content_entries" USING btree ("organization_id","project_id","deleted_at");--> statement-breakpoint
CREATE INDEX "content_entries_sibling_position_idx" ON "content_entries" USING btree ("organization_id","project_id","parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_active_sibling_position_uidx" ON "content_entries" USING btree ("organization_id",coalesce("project_id", 0),coalesce("parent_id", 0),"position") WHERE "content_entries"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_org_slug_active_uidx" ON "content_entries" USING btree ("organization_id","slug") WHERE "content_entries"."project_id" is null and "content_entries"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_project_slug_active_uidx" ON "content_entries" USING btree ("organization_id","project_id","slug") WHERE "content_entries"."project_id" is not null and "content_entries"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_public_id_unique_idx" ON "email_messages" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "email_messages_org_status_idx" ON "email_messages" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "email_messages_reference_idx" ON "email_messages" USING btree ("organization_id","reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "email_messages_request_idx" ON "email_messages" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "email_messages_correlation_idx" ON "email_messages" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_provider_messages_provider_message_unique_idx" ON "email_provider_messages" USING btree ("provider","provider_message_id") WHERE "email_provider_messages"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "email_provider_messages_message_attempt_unique_idx" ON "email_provider_messages" USING btree ("email_message_id","attempt_number");--> statement-breakpoint
CREATE INDEX "email_provider_messages_message_idx" ON "email_provider_messages" USING btree ("email_message_id");--> statement-breakpoint
CREATE INDEX "email_provider_messages_org_provider_idx" ON "email_provider_messages" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "email_provider_messages_provider_delivery_idx" ON "email_provider_messages" USING btree ("provider","provider_delivery_id");--> statement-breakpoint
CREATE INDEX "email_provider_messages_provider_event_idx" ON "email_provider_messages" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "email_provider_messages_request_idx" ON "email_provider_messages" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "email_provider_messages_correlation_idx" ON "email_provider_messages" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_webhook_events_dedupe_key_unique_idx" ON "email_webhook_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "email_webhook_events_provider_delivery_idx" ON "email_webhook_events" USING btree ("provider","provider_delivery_id");--> statement-breakpoint
CREATE INDEX "email_webhook_events_provider_event_idx" ON "email_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "email_webhook_events_provider_message_idx" ON "email_webhook_events" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE INDEX "email_webhook_events_processing_status_received_idx" ON "email_webhook_events" USING btree ("processing_status","received_at");--> statement-breakpoint
CREATE INDEX "email_webhook_events_org_event_received_idx" ON "email_webhook_events" USING btree ("organization_id","normalized_event_type","received_at");--> statement-breakpoint
CREATE INDEX "encrypted-store_entries_tenant_entity_field_idx" ON "encrypted-store_entries" USING btree ("organization_id","entity_type","entity_id","field_path");--> statement-breakpoint
CREATE INDEX "encrypted-store_entries_classification_idx" ON "encrypted-store_entries" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "encrypted-store_entries_key_id_idx" ON "encrypted-store_entries" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "encrypted-store_entries_rotated_at_idx" ON "encrypted-store_entries" USING btree ("rotated_at");--> statement-breakpoint
CREATE INDEX "encrypted-store_entries_created_at_idx" ON "encrypted-store_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "encrypted-store_entries_rotation_idx" ON "encrypted-store_entries" USING btree ("organization_id","key_id","id");--> statement-breakpoint
CREATE INDEX "encrypted-store_entries_org_key_entity_type_id_idx" ON "encrypted-store_entries" USING btree ("organization_id","key_id","entity_type","id");--> statement-breakpoint
CREATE INDEX "files_org_active_idx" ON "files" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "files_org_purpose_active_idx" ON "files" USING btree ("organization_id","purpose","deleted_at");--> statement-breakpoint
CREATE INDEX "files_org_status_active_idx" ON "files" USING btree ("organization_id","status","deleted_at");--> statement-breakpoint
CREATE INDEX "files_uploaded_by_created_at_idx" ON "files" USING btree ("uploaded_by_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "files_org_storage_bucket_key_active_uidx" ON "files" USING btree ("organization_id","storage_instance","bucket","object_key") WHERE "files"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "invitations_tenant_status_idx" ON "invitations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "invitations_tenant_email_hash_idx" ON "invitations" USING btree ("organization_id","email_hash");--> statement-breakpoint
CREATE INDEX "invitations_encryption_key_version_idx" ON "invitations" USING btree ("encryption_key_version");--> statement-breakpoint
CREATE INDEX "issue_activity_issue_created_idx" ON "issue_activity" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_activity_org_created_idx" ON "issue_activity" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_assignees_issue_idx" ON "issue_assignees" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_assignees_user_idx" ON "issue_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_assignees_issue_user_uidx" ON "issue_assignees" USING btree ("issue_id","user_id");--> statement-breakpoint
CREATE INDEX "issue_attachments_issue_created_idx" ON "issue_attachments" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_attachments_file_active_idx" ON "issue_attachments" USING btree ("organization_id","file_id","deleted_at");--> statement-breakpoint
CREATE INDEX "issue_attachments_org_active_idx" ON "issue_attachments" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "issue_attachments_storage_key_active_idx" ON "issue_attachments" USING btree ("organization_id","storage_key","deleted_at");--> statement-breakpoint
CREATE INDEX "issue_comments_issue_created_idx" ON "issue_comments" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_comments_org_active_idx" ON "issue_comments" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "issue_comments_parent_idx" ON "issue_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_comments_issue_id_id_uidx" ON "issue_comments" USING btree ("issue_id","id");--> statement-breakpoint
CREATE INDEX "issue_label_assignments_org_idx" ON "issue_label_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "issue_label_assignments_issue_idx" ON "issue_label_assignments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_label_assignments_label_idx" ON "issue_label_assignments" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_label_assignments_issue_label_uidx" ON "issue_label_assignments" USING btree ("issue_id","label_id");--> statement-breakpoint
CREATE INDEX "issue_labels_org_active_idx" ON "issue_labels" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "issue_labels_scope_active_idx" ON "issue_labels" USING btree ("organization_id","project_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_labels_org_name_active_uidx" ON "issue_labels" USING btree ("organization_id",lower("name")) WHERE "issue_labels"."project_id" is null and "issue_labels"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_labels_scope_name_active_uidx" ON "issue_labels" USING btree ("organization_id","project_id",lower("name")) WHERE "issue_labels"."project_id" is not null and "issue_labels"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_labels_org_id_uidx" ON "issue_labels" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "issue_relations_source_issue_idx" ON "issue_relations" USING btree ("source_issue_id");--> statement-breakpoint
CREATE INDEX "issue_relations_target_issue_idx" ON "issue_relations" USING btree ("target_issue_id");--> statement-breakpoint
CREATE INDEX "issue_relations_org_type_idx" ON "issue_relations" USING btree ("organization_id","relation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_relations_source_target_type_uidx" ON "issue_relations" USING btree ("source_issue_id","target_issue_id","relation_type");--> statement-breakpoint
CREATE INDEX "issue_watchers_issue_idx" ON "issue_watchers" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_watchers_user_idx" ON "issue_watchers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_watchers_issue_user_uidx" ON "issue_watchers" USING btree ("issue_id","user_id");--> statement-breakpoint
CREATE INDEX "issues_organization_idx" ON "issues" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_org_id_uidx" ON "issues" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "issues_active_org_idx" ON "issues" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "issues_active_scope_idx" ON "issues" USING btree ("organization_id","project_id","deleted_at");--> statement-breakpoint
CREATE INDEX "issues_scope_status_position_idx" ON "issues" USING btree ("organization_id","project_id","status","position");--> statement-breakpoint
CREATE INDEX "issues_updated_at_active_idx" ON "issues" USING btree ("organization_id","updated_at","deleted_at");--> statement-breakpoint
CREATE INDEX "issues_parent_issue_idx" ON "issues" USING btree ("parent_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_org_number_active_uidx" ON "issues" USING btree ("organization_id","issue_number") WHERE "issues"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "key_rotation_state_organization_id_idx" ON "key_rotation_state" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "key_rotation_state_org_old_key_status_idx" ON "key_rotation_state" USING btree ("organization_id","old_key_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "key_rotation_state_org_old_new_key_unique_idx" ON "key_rotation_state" USING btree ("organization_id","old_key_id","new_key_id");--> statement-breakpoint
CREATE INDEX "key_rotation_state_status_idx" ON "key_rotation_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "key_rotation_state_created_at_idx" ON "key_rotation_state" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kms_rotation_checkpoint_key_name_unique_idx" ON "kms_rotation_checkpoint" USING btree ("key_name");--> statement-breakpoint
CREATE INDEX "kms_rotation_checkpoint_updated_at_idx" ON "kms_rotation_checkpoint" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_tenant_id" ON "organizations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_slug" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_organizations_public_id" ON "organizations" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_is_active" ON "organizations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_organizations_gcp_tenant_id" ON "organizations" USING btree ("gcp_tenant_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_owner_id" ON "organizations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_tenant_email_hash_idx" ON "password_reset_tokens" USING btree ("organization_id","email_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_tenant_user_idx" ON "password_reset_tokens" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_token_validation_idx" ON "password_reset_tokens" USING btree ("token_hash","used_at","expires_at");--> statement-breakpoint
CREATE INDEX "project_members_project_idx" ON "project_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_user_uidx" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "projects_organization_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_active_organization_idx" ON "projects" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_key_active_uidx" ON "projects" USING btree ("organization_id","key") WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projects_visibility_organization_idx" ON "projects" USING btree ("organization_id","visibility","deleted_at");--> statement-breakpoint
CREATE INDEX "projects_creator_organization_idx" ON "projects" USING btree ("organization_id","created_by","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tenants_type_status" ON "tenants" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "idx_tenants_public_id" ON "tenants" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "user_addresses_tenant_user_type_idx" ON "user_addresses" USING btree ("organization_id","user_id","address_type","deleted_at");--> statement-breakpoint
CREATE INDEX "user_addresses_default_idx" ON "user_addresses" USING btree ("organization_id","user_id","is_default","deleted_at");--> statement-breakpoint
CREATE INDEX "user_addresses_country_idx" ON "user_addresses" USING btree ("organization_id","country_code","deleted_at");--> statement-breakpoint
CREATE INDEX "user_addresses_user_idx" ON "user_addresses" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "user_addresses_street_encrypted_store_idx" ON "user_addresses" USING btree ("street_encrypted_store_id");--> statement-breakpoint
CREATE INDEX "user_addresses_street2_encrypted_store_idx" ON "user_addresses" USING btree ("street2_encrypted_store_id");--> statement-breakpoint
CREATE INDEX "user_addresses_city_encrypted_store_idx" ON "user_addresses" USING btree ("city_encrypted_store_id");--> statement-breakpoint
CREATE INDEX "user_addresses_state_encrypted_store_idx" ON "user_addresses" USING btree ("state_encrypted_store_id");--> statement-breakpoint
CREATE INDEX "user_addresses_postal_code_encrypted_store_idx" ON "user_addresses" USING btree ("postal_code_encrypted_store_id");--> statement-breakpoint
CREATE INDEX "user_addresses_country_encrypted_store_idx" ON "user_addresses" USING btree ("country_encrypted_store_id");--> statement-breakpoint
CREATE INDEX "user_identities_user_id_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_identities_provider_uid_idx" ON "user_identities" USING btree ("provider_uid");--> statement-breakpoint
CREATE INDEX "user_identities_provider_lookup_idx" ON "user_identities" USING btree ("provider","provider_uid");--> statement-breakpoint
CREATE INDEX "user_identities_primary_idx" ON "user_identities" USING btree ("user_id","is_primary");--> statement-breakpoint
CREATE INDEX "user_identities_provider_email_hash_idx" ON "user_identities" USING btree ("provider_email_hash");--> statement-breakpoint
CREATE INDEX "user_identities_encryption_key_version_idx" ON "user_identities" USING btree ("encryption_key_version");--> statement-breakpoint
CREATE UNIQUE INDEX "user_org_settings_user_org_key_unique_idx" ON "user_organization_settings" USING btree ("user_id","organization_id","setting_key");--> statement-breakpoint
CREATE INDEX "user_org_settings_org_user_idx" ON "user_organization_settings" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "user_org_settings_user_key_idx" ON "user_organization_settings" USING btree ("user_id","setting_key");--> statement-breakpoint
CREATE INDEX "idx_user_roles_user_id" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_roles_role" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_user_roles_expires_at" ON "user_roles" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_roles_user_id_expires_at" ON "user_roles" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_tenants_user_tenant" ON "user_tenants" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_user_tenants_user_tenant_active" ON "user_tenants" USING btree ("user_id","tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_user_tenants_user_id" ON "user_tenants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_tenants_tenant_id" ON "user_tenants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_user_tenants_user_default" ON "user_tenants" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "idx_user_tenants_is_active" ON "user_tenants" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "users_email_hash_idx" ON "users" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "users_tenant_email_hash_idx" ON "users" USING btree ("organization_id","email_hash");--> statement-breakpoint
CREATE INDEX "users_org_deleted_idx" ON "users" USING btree ("organization_id","deleted_at");--> statement-breakpoint
CREATE INDEX "users_encryption_key_version_idx" ON "users" USING btree ("encryption_key_version");