import { db, closePool, eq, user as userTable } from "@repo/db";
import { auth } from "@repo/core/auth";

// Idempotent — safe to re-run. Uses the same trusted server-side auth.api.createUser
// path documented in AGENTS.md's "Platform admin" section (no `headers` passed, so
// Better Auth skips the requesting-user permission check entirely — this script IS
// the trusted context, same reasoning as ADMIN_USER_IDS). Reads/updates the `user`
// table directly with the bare `db` client, not withSystemScope — `user` is a
// Better-Auth-generated table, deliberately not RLS-enabled (see AGENTS.md's Row-Level
// Security section), so there's no scope to bypass here.
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Platform Admin";

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must both be set to seed an admin.");
  }

  const [existing] = await db.select().from(userTable).where(eq(userTable.email, email));

  if (existing) {
    if (existing.role === "admin") {
      console.log(`Already a platform admin: ${email} (${existing.id})`);
      return;
    }
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, existing.id));
    console.log(`Promoted existing user to platform admin: ${email} (${existing.id})`);
    return;
  }

  const created = await auth.api.createUser({
    body: { email, password, name, role: "admin" },
  });
  console.log(`Created platform admin: ${email} (${created.user.id})`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exitCode = 1;
  });
