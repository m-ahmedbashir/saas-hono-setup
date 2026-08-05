import { notification } from "./schema";
import type { DbExecutor } from "./index";

// Lives here rather than apps/api's notifications module for the same reason
// organization-profile.ts's ensureOrganizationProfileRow does: it needs to be callable
// from packages/core's `afterAddMember` Better Auth hook (packages/core/src/auth/index.ts),
// and packages/core cannot import from apps/api (see AGENTS.md's DDD layering rule) —
// this is the repo's second instance of that same documented DIP exception. Kept
// deliberately minimal (just the insert): apps/api's own notifications.db.ts owns the
// richer query surface (list/markRead/countUnread) that only apps/api's REST layer
// needs, reusing this function rather than duplicating the insert.

export interface NewNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  actionUrl?: string | null;
}

export async function insertNotification(tx: DbExecutor, values: NewNotification) {
  const [created] = await tx
    .insert(notification)
    .values({ ...values, actionUrl: values.actionUrl ?? null })
    .returning();
  return created!;
}
