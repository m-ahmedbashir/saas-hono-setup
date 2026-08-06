-- Custom SQL migration file, put your code below! --

-- Every ownerType's "no billing row yet" entitlement fallback (entitlement.middleware.ts /
-- seat-limit.middleware.ts) resolves to whichever shared plan has is_default = true — but
-- nothing before this migration ever created that row. It only existed in any environment
-- where someone happened to POST /subscription-plans by hand after migrating; a genuinely
-- fresh database (CI, a new environment) has an empty subscription_plans table, so every
-- entitlement check falls through with no default to resolve and incorrectly denies
-- (402) even plans that should be free. See AGENTS.md's Row-Level Security section's
-- sibling note on this table not being RLS-scoped (shared catalog, not per-org data) for
-- why a plain migration — not a per-org seed — is the right place for this.
--
-- ON CONFLICT targets the exact partial unique index subscription_plans_shared_owner_plan_idx
-- (owner_type, plan_id) WHERE organization_id IS NULL — so this is safe to run against an
-- environment (like this repo's own dev database) that already has these rows from manual
-- testing before this migration existed; it silently no-ops there instead of colliding.
insert into "subscription_plans" (
  "id", "owner_type", "plan_id", "name", "seat_limit", "features", "limits", "is_active", "is_default"
) values (
  'seed-plan-organization-free',
  'organization',
  'free',
  'Free',
  3,
  '{"api_access": false, "custom_branding": false, "priority_support": false, "advanced_analytics": false}',
  '{"maxProjects": 3, "maxApiRequestsPerMonth": 1000}',
  true,
  true
) on conflict ("owner_type", "plan_id") where "organization_id" is null do nothing;

insert into "subscription_plans" (
  "id", "owner_type", "plan_id", "name", "seat_limit", "features", "limits", "is_active", "is_default"
) values (
  'seed-plan-individual-free',
  'individual',
  'individual_free',
  'Individual Free',
  null,
  '{"api_access": false, "custom_branding": false, "priority_support": false, "advanced_analytics": false}',
  '{"maxProjects": 1, "maxApiRequestsPerMonth": 100}',
  true,
  true
) on conflict ("owner_type", "plan_id") where "organization_id" is null do nothing;
