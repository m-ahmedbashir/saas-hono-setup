import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@repo/db";
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
    }),
  ],
});
