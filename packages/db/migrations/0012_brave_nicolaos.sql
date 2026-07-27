ALTER TABLE "organization_profile" ADD COLUMN "suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "suspension_reason" text;