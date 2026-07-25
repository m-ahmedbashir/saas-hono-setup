import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // Platform-wide operator role (e.g. "admin"), added by the `admin` plugin
  // (packages/core/src/auth/index.ts) — see AGENTS.md's Platform admin section. A
  // different concept from `member.role` below: this is one flag on the account itself,
  // not per-organization. Nullable/no default, matching the plugin's own generated shape
  // — a normal user has no `role` value at all, not an explicit "user" string.
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    // Set on a session created via POST /api/auth/admin/impersonate-user — holds the
    // impersonating admin's user id. Better Auth's own admin plugin filters sessions
    // carrying this out of list-sessions responses; nothing in this app queries it directly.
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

// Not a Better Auth-generated table (unlike the ones above) — hand-written and
// migrated normally via drizzle-kit. FK'd to `organization.id` rather than adding
// columns to `organization` itself, since that table IS generated and would drift
// on the next `@better-auth/cli generate` run. See AGENTS.md's billing section.
export const organizationBilling = pgTable(
  "organization_billing",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Matches @repo/core's OrganizationPlanId ("free" | "starter" | "growth"). Kept as free text,
    // not a DB enum, since packages/db can't import from packages/core (would create
    // a circular workspace dependency) — validated at the app boundary instead, same
    // trust model as `member.role` above.
    plan: text("plan").notNull().default("free"),
    providerCustomerId: text("provider_customer_id"),
    // Unique (not just indexed) as defense-in-depth: guarantees at the DB level that
    // updateBillingBySubscriptionId's WHERE clause can only ever match one row, even
    // though app-level reasoning already establishes Stripe subscription ids can't
    // collide across rows in practice. NULL-safe — Postgres allows multiple NULLs in
    // a UNIQUE column, which is what every not-yet-subscribed row has.
    providerSubscriptionId: text("provider_subscription_id").unique(),
    // Matches @repo/core's SubscriptionStatus ("active" | "past_due" | "canceled" | "incomplete").
    subscriptionStatus: text("subscription_status"),
    seatQuantity: integer("seat_quantity"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("organization_billing_organizationId_idx").on(table.organizationId)],
);

export const organizationBillingRelations = relations(organizationBilling, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationBilling.organizationId],
    references: [organization.id],
  }),
}));

// Not a Better Auth-generated table — hand-written, own table rather than columns on
// `organization` for the same reason as organizationBilling. Unlike billing/profile
// elsewhere in this file, this row is created eagerly (via a Better Auth
// `afterCreateOrganization` hook, see packages/core/src/auth/index.ts) rather than
// lazily on first access — `orgNumber` specifically needs to exist reliably from the
// moment the org exists, not "whenever someone first opens settings." See AGENTS.md's
// Organization Profile section.
export const organizationProfile = pgTable(
  "organization_profile",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Permanent, human-friendly, low-sensitivity identifier — safe to display/log/read
    // aloud. Deliberately NOT a join/invite credential (see AGENTS.md) — just an
    // identity reference, generated in packages/db/src/organization-profile.ts.
    orgNumber: text("org_number").notNull().unique(),
    industry: text("industry"),
    companySize: text("company_size"),
    website: text("website"),
    phone: text("phone"),
    taxId: text("tax_id"),
    description: text("description"),
    addressStreet: text("address_street"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    addressPostalCode: text("address_postal_code"),
    addressCountry: text("address_country"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("organization_profile_organizationId_idx").on(table.organizationId),
    index("organization_profile_orgNumber_idx").on(table.orgNumber),
  ],
);

export const organizationProfileRelations = relations(organizationProfile, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationProfile.organizationId],
    references: [organization.id],
  }),
}));

// Individual (B2C) billing — a separate table from `organizationBilling`, not a
// nullable-fields variant of it. No seat/quantity concept for an individual, so
// reusing that shape would mean a meaningless `seatQuantity` on every row. FK'd to
// `user.id`, same "own table, not columns on the generated table" reasoning as
// `organizationBilling` vs `organization`. See AGENTS.md's Billing model section.
export const individualBilling = pgTable(
  "individual_billing",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    // Matches @repo/core's IndividualPlanId ("individual_free" | "individual_pro").
    plan: text("plan").notNull().default("individual_free"),
    providerCustomerId: text("provider_customer_id"),
    // Unique as defense-in-depth — same reasoning as organizationBilling above.
    providerSubscriptionId: text("provider_subscription_id").unique(),
    subscriptionStatus: text("subscription_status"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("individual_billing_userId_idx").on(table.userId)],
);

export const individualBillingRelations = relations(individualBilling, ({ one }) => ({
  user: one(user, {
    fields: [individualBilling.userId],
    references: [user.id],
  }),
}));

// Not a Better Auth-generated table — hand-written, own table rather than columns on
// `user` for the same reason as organizationBilling/individualBilling: `user` is
// generated and would drift on the next `@better-auth/cli generate` run. One row per
// user regardless of B2C/B2B2C — a phone number or address is a person's, not an org's.
// Address is structured (not a single free-text column) so it's usable for
// shipping/tax/filtering later; `addressCountry` is validated as an ISO 3166-1 alpha-2
// code at the app boundary (packages/db can't import Zod validators — see plan/free-text
// reasoning on organizationBilling's `plan` column above).
export const profile = pgTable(
  "profile",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    phone: text("phone"),
    // Stored as a date of birth, not a raw age — an age goes stale the moment a year
    // passes; dateOfBirth is the actual source of truth, age is derived when needed.
    dateOfBirth: date("date_of_birth", { mode: "date" }),
    addressStreet: text("address_street"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    addressPostalCode: text("address_postal_code"),
    addressCountry: text("address_country"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("profile_userId_idx").on(table.userId)],
);

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, {
    fields: [profile.userId],
    references: [user.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));
