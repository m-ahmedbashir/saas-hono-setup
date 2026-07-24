-- Row-Level Security on `user_billing` — same pattern and reasoning as `billing`'s
-- policy (0002_billing_rls.sql), scoped by user id instead of org id. See
-- packages/db/src/index.ts's withUserScope/withSystemScope and AGENTS.md's Row-Level
-- Security section.
ALTER TABLE "user_billing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_billing" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "user_billing_owner_isolation" ON "user_billing"
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
