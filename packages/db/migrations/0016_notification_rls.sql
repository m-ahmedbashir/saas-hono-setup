-- Row-Level Security on `notification` — same pattern and reasoning as
-- `individual_billing`'s policy (0004_user_billing_rls.sql), scoped by user id. A
-- notification is exactly the same shape of per-user-owned row regardless of whether
-- its recipient is an individual, an org member, or platform staff — one policy
-- covers all three. See packages/db/src/index.ts's withUserScope/withSystemScope and
-- AGENTS.md's Row-Level Security section.
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "notification_owner_isolation" ON "notification"
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );