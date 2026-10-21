-- Custom SQL migration file, put your code below! --

-- One-time backfill for billing.handlers.ts's new rule: a subscription that has ended
-- returns its billing row to the owner type's default plan. Before that rule, the
-- subscription-ended webhook only set subscription_status = 'canceled' and left `plan` on
-- the paid tier — and entitlements/seat limits resolve from `plan`, so those rows kept
-- granting what they no longer paid for. New cancellations are handled by the webhook;
-- this fixes rows that were already canceled. Idempotent: a row already on the default
-- plan is left alone, and if no default plan exists (an unseeded database) nothing changes.
update "organization_billing" as b
set "plan" = d."plan_id"
from "subscription_plans" as d
where d."owner_type" = 'organization'
  and d."organization_id" is null
  and d."is_default" = true
  and b."subscription_status" = 'canceled'
  and b."plan" <> d."plan_id";
--> statement-breakpoint
update "individual_billing" as b
set "plan" = d."plan_id"
from "subscription_plans" as d
where d."owner_type" = 'individual'
  and d."organization_id" is null
  and d."is_default" = true
  and b."subscription_status" = 'canceled'
  and b."plan" <> d."plan_id";
