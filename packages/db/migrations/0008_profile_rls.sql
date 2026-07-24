-- Row-Level Security on `profile` — same pattern and reasoning as `individual_billing`'s
-- policy (0004_user_billing_rls.sql), scoped by user id. Profile data (phone, date of
-- birth, address) is at least as sensitive as billing plan info, so it gets the same
-- defense-in-depth treatment. See packages/db/src/index.ts's withUserScope/
-- withSystemScope and AGENTS.md's Row-Level Security section.
ALTER TABLE "profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "profile_owner_isolation" ON "profile"
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
