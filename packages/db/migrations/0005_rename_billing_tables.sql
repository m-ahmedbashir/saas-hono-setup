-- Renaming both billing tables for a consistent organization/individual pairing
-- throughout the codebase — files (organization-billing.db.ts/individual-billing.db.ts),
-- types (PlanId/IndividualPlanId), and ownerType literals already use this terminology;
-- the table names were the one place still saying generic "billing" / ambiguous "user".
-- Data-preserving rename (RENAME TO), not a drop+recreate — existing rows, the FK, and
-- the RLS policy all carry over automatically.
ALTER TABLE "billing" RENAME TO "organization_billing";--> statement-breakpoint
ALTER TABLE "user_billing" RENAME TO "individual_billing";--> statement-breakpoint

ALTER TABLE "organization_billing" RENAME CONSTRAINT "billing_organization_id_unique" TO "organization_billing_organization_id_unique";--> statement-breakpoint
ALTER TABLE "organization_billing" RENAME CONSTRAINT "billing_organization_id_organization_id_fk" TO "organization_billing_organization_id_organization_id_fk";--> statement-breakpoint
ALTER INDEX "billing_organizationId_idx" RENAME TO "organization_billing_organizationId_idx";--> statement-breakpoint
ALTER POLICY "billing_org_isolation" ON "organization_billing" RENAME TO "organization_billing_isolation";--> statement-breakpoint

ALTER TABLE "individual_billing" RENAME CONSTRAINT "user_billing_user_id_unique" TO "individual_billing_user_id_unique";--> statement-breakpoint
ALTER TABLE "individual_billing" RENAME CONSTRAINT "user_billing_user_id_user_id_fk" TO "individual_billing_user_id_user_id_fk";--> statement-breakpoint
ALTER INDEX "user_billing_userId_idx" RENAME TO "individual_billing_userId_idx";--> statement-breakpoint
ALTER POLICY "user_billing_owner_isolation" ON "individual_billing" RENAME TO "individual_billing_isolation";--> statement-breakpoint

-- The `personal_*` plan id literals got renamed to `individual_*` (packages/core's
-- IndividualPlanId) before any real checkout ever wrote a row here — fixing the
-- column default and any (currently nonexistent, but defensive) existing rows so the
-- DB doesn't disagree with the application's type.
ALTER TABLE "individual_billing" ALTER COLUMN "plan" SET DEFAULT 'individual_free';--> statement-breakpoint
UPDATE "individual_billing" SET "plan" = 'individual_free' WHERE "plan" = 'personal_free';--> statement-breakpoint
UPDATE "individual_billing" SET "plan" = 'individual_pro' WHERE "plan" = 'personal_pro';
