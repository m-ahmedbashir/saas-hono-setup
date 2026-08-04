CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"plan_id" text NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"description" text,
	"seat_limit" integer,
	"provider_price_id" text,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_owner_plan_org_idx" ON "subscription_plans" USING btree ("owner_type","plan_id","organization_id");--> statement-breakpoint
CREATE INDEX "subscription_plans_owner_org_active_idx" ON "subscription_plans" USING btree ("owner_type","organization_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_one_default_per_owner_type_idx" ON "subscription_plans" USING btree ("owner_type") WHERE "subscription_plans"."is_default" = true AND "subscription_plans"."organization_id" IS NULL;