-- Row-Level Security on `billing` — defense-in-depth on top of the app-level org
-- scoping already enforced in Hono middleware. See packages/db/src/rls.ts and
-- AGENTS.md's "Row-Level Security" section for how app code sets these session vars.
--
-- FORCE (not just ENABLE) matters: the app connects as the table owner (e.g. Neon's
-- default DB role), and Postgres exempts table owners from RLS unless FORCE is also
-- set. Without this line the policy below would silently do nothing for our own app.
ALTER TABLE "billing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Default-deny: current_setting(..., true) returns NULL (not an error) when unset,
-- so a query that goes through neither withOrgScope nor withSystemScope sees zero
-- rows rather than erroring — fail closed, not fail open.
CREATE POLICY "billing_org_isolation" ON "billing"
  USING (
    organization_id = current_setting('app.current_org_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
