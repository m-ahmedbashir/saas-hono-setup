import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, withOrgScope, ensureOrganizationProfileRow } from "@repo/db";
import * as schema from "@repo/db/schema";
import { accessControl, memberRole, adminRole, ownerRole } from "./permissions";

export { statement } from "./permissions";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(","),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      ac: accessControl,
      roles: {
        owner: ownerRole,
        member: memberRole,
        admin: adminRole,
      },
      // A second instance of this file's one documented DIP exception (importing `db`
      // for the adapter above) — Better Auth's hook API can only be wired here, inside
      // the same betterAuth() config, so the organization_profile row (specifically its
      // orgNumber) can be created immediately rather than lazily. See AGENTS.md's
      // Organization Profile section. Failure here would otherwise silently swallow the
      // org creation response's success — let it propagate; it's a real bug to see.
      organizationHooks: {
        afterCreateOrganization: async ({ organization: createdOrganization }) => {
          await withOrgScope(createdOrganization.id, (tx) =>
            ensureOrganizationProfileRow(tx, createdOrganization.id),
          );
        },
      },
    }),
  ],
});
