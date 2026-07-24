CREATE TABLE "organization_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"org_number" text NOT NULL,
	"industry" text,
	"company_size" text,
	"website" text,
	"phone" text,
	"tax_id" text,
	"description" text,
	"address_street" text,
	"address_city" text,
	"address_state" text,
	"address_postal_code" text,
	"address_country" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_profile_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "organization_profile_org_number_unique" UNIQUE("org_number")
);
--> statement-breakpoint
ALTER TABLE "organization_profile" ADD CONSTRAINT "organization_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_profile_organizationId_idx" ON "organization_profile" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_profile_orgNumber_idx" ON "organization_profile" USING btree ("org_number");