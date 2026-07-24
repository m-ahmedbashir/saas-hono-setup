-- Row-Level Security on `organization_profile` — same pattern and reasoning as
-- `organization_billing`'s policy (0002_billing_rls.sql), scoped by org id. See
-- packages/db/src/index.ts's withOrgScope/withSystemScope and AGENTS.md's Row-Level
-- Security section.
ALTER TABLE "organization_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "organization_profile_isolation" ON "organization_profile"
  USING (
    organization_id = current_setting('app.current_org_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
