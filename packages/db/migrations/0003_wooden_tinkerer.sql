CREATE TABLE "user_billing" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" text DEFAULT 'personal_free' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"subscription_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_billing_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_billing" ADD CONSTRAINT "user_billing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_billing_userId_idx" ON "user_billing" USING btree ("user_id");