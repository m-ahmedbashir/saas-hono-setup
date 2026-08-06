-- Custom SQL migration file, put your code below! --

-- billing_events is an append-only audit log (see specs/billing-integrity-plan.md) —
-- immutability is enforced here at the Postgres grant level, not just by convention, so
-- it holds even against a future application bug. app_user is the restricted runtime
-- role every query in this app actually runs as (see AGENTS.md's Row-Level Security
-- section) — INSERT/SELECT stay granted via the existing ALTER DEFAULT PRIVILEGES rule
-- from create-app-role.js; only UPDATE/DELETE are revoked here.
revoke update, delete on "billing_events" from app_user;
