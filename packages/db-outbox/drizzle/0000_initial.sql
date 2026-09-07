CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"aggregate_id" varchar(255) NOT NULL,
	"aggregate_version" varchar(50),
	"payload" jsonb NOT NULL,
	"correlation_id" uuid,
	"causation_id" uuid,
	"tenant_id" varchar(255) NOT NULL,
	"schema_version" varchar(20) DEFAULT '1.0' NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_retry_at" timestamp,
	"next_retry_at" timestamp,
	"error_message" text,
	"published_at" timestamp,
	"locked_at" timestamp,
	"locked_by" varchar(255),
	"dead_lettered_at" timestamp,
	"dead_letter_reason" varchar(50),
	"replayed_at" timestamp,
	"replayed_count" integer DEFAULT 0 NOT NULL,
	"last_replay_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_event_unique" UNIQUE("event_id","aggregate_id","tenant_id")
);
--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "outbox_tenant_idx" ON "outbox" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outbox_tenant_status_created_idx" ON "outbox" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "outbox_aggregate_idx" ON "outbox" USING btree ("aggregate_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_cleanup_idx" ON "outbox" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "outbox_dead_letter_idx" ON "outbox" USING btree ("dead_lettered_at");--> statement-breakpoint
CREATE INDEX "outbox_dead_letter_tenant_idx" ON "outbox" USING btree ("dead_lettered_at","tenant_id");--> statement-breakpoint
CREATE INDEX "outbox_replay_idx" ON "outbox" USING btree ("last_replay_id");
CREATE OR REPLACE FUNCTION outbox_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = NOW();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS outbox_set_updated_at_trigger ON "outbox";--> statement-breakpoint
CREATE TRIGGER outbox_set_updated_at_trigger
BEFORE UPDATE ON "outbox"
FOR EACH ROW
EXECUTE FUNCTION outbox_set_updated_at();
