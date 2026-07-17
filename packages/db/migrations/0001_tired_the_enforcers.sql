CREATE TABLE "billing" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"subscription_status" text,
	"seat_quantity" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "billing" ADD CONSTRAINT "billing_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_organizationId_idx" ON "billing" USING btree ("organization_id");