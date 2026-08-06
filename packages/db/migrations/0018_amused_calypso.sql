CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"owner_type" text,
	"owner_id" text,
	"event_created_at" timestamp NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"organization_id" text,
	"user_id" text,
	"plan_id" text NOT NULL,
	"amount_total" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"stripe_invoice_id" text,
	"stripe_payment_intent_id" text,
	"provider_subscription_id" text NOT NULL,
	"receipt_url" text,
	"issued_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "invoices_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
ALTER TABLE "individual_billing" ADD COLUMN "last_event_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization_billing" ADD COLUMN "last_event_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_events_owner_idx" ON "billing_events" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "billing_events_type_idx" ON "billing_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "invoices_organizationId_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_userId_idx" ON "invoices" USING btree ("user_id");