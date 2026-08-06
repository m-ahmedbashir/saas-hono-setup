import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  date,
  jsonb,
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
    // Stripe's own `created` timestamp on the most recent webhook event actually applied
    // to this row — NOT when we received it. Webhook delivery is at-least-once but not
    // ordered; every subscription-lifecycle update guards on this (see
    // specs/billing-integrity-plan.md's Fix 3) so a late-arriving retry of an older event
    // can never overwrite a row a newer event already corrected. NULL until the first
    // lifecycle event lands (checkout_completed doesn't set this — only
    // subscription_updated/subscription_canceled do, since only those can race).
    lastEventAt: timestamp("last_event_at"),
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
    // Platform-admin oversight flag, not a self-service organization setting — set only
    // via apps/api's platform-organizations module (requirePlatformPermission-gated).
    // Flag-only for now, no access enforcement wired to it yet: no route currently
    // checks this before letting a suspended org's members act. See
    // specs/platform-organizations.md for the deliberate scope of "flag now, enforcement
    // later, once it's agreed which routes it should actually block."
    suspended: boolean("suspended").default(false).notNull(),
    suspendedAt: timestamp("suspended_at"),
    suspensionReason: text("suspension_reason"),
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
    // Same event-ordering guard as organizationBilling.lastEventAt — see its comment and
    // specs/billing-integrity-plan.md's Fix 3.
    lastEventAt: timestamp("last_event_at"),
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

// Append-only audit log of every Stripe webhook event this app has ever received —
// never UPDATEd, never DELETEd (enforced at the Postgres level, see the RLS migration's
// sibling custom migration that REVOKEs UPDATE/DELETE from app_user; a plain schema
// migration can't express a REVOKE). System-populated, not owner-scoped app data —
// deliberately NOT RLS-enabled, same reasoning as subscriptionPlans below: there's no
// single session-scoped owner to check against, and the webhook handler already runs
// under withSystemScope. See specs/billing-integrity-plan.md.
export const billingEvents = pgTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    // Stripe's own evt_... id — the actual idempotency guard (see insertBillingEvent's
    // doc comment): a duplicate webhook delivery hits this unique constraint and the
    // insert fails, which is how the caller knows to skip reprocessing.
    stripeEventId: text("stripe_event_id").notNull().unique(),
    type: text("type").notNull(),
    ownerType: text("owner_type"),
    ownerId: text("owner_id"),
    // Stripe's own `created` field on the event — logical order, not arrival order. Used
    // to guard organizationBilling/individualBilling's current-state updates against
    // out-of-order delivery (see their lastEventAt columns' comments).
    eventCreatedAt: timestamp("event_created_at").notNull(),
    payload: jsonb("payload").notNull(),
    // When *we* received it — kept distinct from eventCreatedAt on purpose, never used
    // for ordering decisions.
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  (table) => [
    index("billing_events_owner_idx").on(table.ownerType, table.ownerId),
    index("billing_events_type_idx").on(table.type),
  ],
);

// Curated, one-row-per-real-transaction receipt/order record — what a "billing history"
// page or a "download receipt" button reads from, as opposed to billingEvents' raw JSONB.
// Populated from invoice.paid/charge.refunded specifically, not every event type. Not
// RLS-enabled for the same system-populated reasoning as billingEvents; unlike that
// table, normal app_user grants apply here — marking a row refunded is a real,
// intentional mutation, not a bug to guard against.
export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    ownerType: text("owner_type").notNull(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    // Snapshot at purchase time — NOT a live FK to subscriptionPlans, since a plan can be
    // edited/deactivated later and a receipt must keep reflecting what was actually true
    // when the money moved.
    planId: text("plan_id").notNull(),
    // In cents, matches Stripe's own integer-cents convention.
    amountTotal: integer("amount_total").notNull(),
    currency: text("currency").notNull(),
    // "paid" | "refunded" | "partially_refunded"
    status: text("status").notNull(),
    stripeInvoiceId: text("stripe_invoice_id").unique(),
    // The join key a later `charge.refunded` event correlates back to this row with.
    // Deliberately the PaymentIntent id, not the Charge id — verified against the
    // installed stripe@22.3.2 types: Stripe's newer API decoupled Charge from Invoice
    // entirely (no `charge.invoice` field exists at all in this API version), while
    // `charge.payment_intent` is a stable, always-present top-level field. Nullable
    // because it depends on the invoice's `payments` sub-list actually being present on
    // the webhook payload — see stripe-billing.service.ts's parseWebhookEvent comment on
    // invoice_paid for the exact caveat.
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    // Stripe's own hosted invoice page — no reason to build a PDF generator when Stripe
    // already hosts one per invoice (hosted_invoice_url, always present, no expansion
    // needed — simpler and more reliable than chasing a Charge's own receipt_url).
    receiptUrl: text("receipt_url"),
    // The real transaction date, taken from the Stripe payload — not this row's insert
    // time, which may lag behind it.
    issuedAt: timestamp("issued_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("invoices_organizationId_idx").on(table.organizationId),
    index("invoices_userId_idx").on(table.userId),
  ],
);

export const invoicesRelations = relations(invoices, ({ one }) => ({
  organization: one(organization, {
    fields: [invoices.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [invoices.userId], references: [user.id] }),
}));

// Admin-editable plan catalog — replaces the two hardcoded organizationPlans/
// individualPlans maps that used to live in packages/core/src/billing/types.ts. See
// specs/subscription-management-plan.md. Global config, not owner-scoped app data —
// deliberately NOT RLS-enabled (unlike organizationBilling/individualBilling above):
// RLS in this repo scopes tables per-owner, and this table has no single owner to scope
// to — every plan row is either shared (readable/usable by any org) or tied to one
// `organizationId` for admin-management purposes only, not as an access-control scope.
// Reads/writes are gated by requirePlatformPermission instead (apps/api's
// subscription-plans module), the same mechanism platform-organizations/
// platform-individuals already use for other platform-wide config.
export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: text("id").primaryKey(),
    // "organization" | "individual" — matches @repo/core's BillingOwner discriminant.
    // Free text, not a DB enum, same reasoning as organizationBilling.plan above
    // (packages/db can't import from packages/core).
    ownerType: text("owner_type").notNull(),
    // Slug-like identifier, e.g. "starter" or "enterprise" — unique within its scope
    // (see the index below), not globally. This is what organizationBilling.plan/
    // individualBilling.plan store as a plain string.
    planId: text("plan_id").notNull(),
    // NULL = shared/public plan any org can subscribe to. Set = a custom/negotiated
    // plan for that one organization only (an enterprise deal) — for admin bookkeeping
    // only, not an RLS scope (see table-level comment above).
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    // NULL for individual plans — no seat/quantity concept, same reasoning as
    // individualBilling having no seatQuantity column.
    seatLimit: integer("seat_limit"),
    // NULL for free/handled-offline plans. Verified live against Stripe
    // (BillingGateway.validatePriceId) before being saved here — see
    // subscription-plans.service.ts.
    providerPriceId: text("provider_price_id"),
    // Keyed by @repo/core's closed FeatureKey/PlanLimitKey unions, re-validated on
    // every read (packages/core/src/billing/entitlements.ts's resolvePlanEntitlements)
    // — never trusted as pre-validated just because it came from this table. jsonb, not
    // a normalized child table: the key vocabulary is closed and small (see
    // entitlements.ts), so a join here would buy nothing a JSONB map doesn't already
    // give for free.
    features: jsonb("features").$type<Record<string, boolean>>().notNull().default({}),
    limits: jsonb("limits").$type<Record<string, number>>().notNull().default({}),
    // Disables a plan for new checkouts without deleting historical rows — this module
    // has no hard delete at all (see specs/subscription-management-plan.md). A
    // deactivated plan's existing subscribers are unaffected; only new checkouts stop
    // offering it.
    isActive: boolean("is_active").notNull().default(true),
    // The plan a new signup with no billing row yet resolves to, per ownerType. Exactly
    // one shared (organizationId IS NULL) plan per ownerType may have this set — see
    // the partial unique index below, the actual enforcement, not just convention.
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Protects same-org duplicates: one organization can't create two custom plans
    // with the identical planId (organizationId is a real, equal, non-null value on
    // both rows, so a plain unique index does catch this).
    uniqueIndex("subscription_plans_owner_plan_org_idx").on(
      table.ownerType,
      table.planId,
      table.organizationId,
    ),
    // Protects shared-plan duplicates — genuinely a separate index, not something the
    // one above also covers. Verified directly against real Postgres behavior, not
    // assumed: standard SQL unique-index semantics treat NULL as distinct from every
    // other NULL (including another NULL), so two shared plans (organizationId IS NULL
    // on both) do NOT collide on the 3-column index above — confirmed by a failing
    // integration test before this index was added, not caught by reasoning alone. A
    // partial index scoped to `organizationId IS NULL` is the only way to get real
    // uniqueness among shared plans; two different orgs' custom plans reusing the same
    // slug (organizationId set, non-null, different per org) are correctly unaffected
    // by this index since they never match its WHERE clause.
    uniqueIndex("subscription_plans_shared_owner_plan_idx")
      .on(table.ownerType, table.planId)
      .where(sql`${table.organizationId} IS NULL`),
    index("subscription_plans_owner_org_active_idx").on(
      table.ownerType,
      table.organizationId,
      table.isActive,
    ),
    // The actual backstop for "exactly one default plan per ownerType" — a
    // service-layer check-then-write alone can't close a concurrent-write race. See
    // specs/subscription-management-plan.md's "Closing the payment-correctness gaps"
    // item 2.
    uniqueIndex("subscription_plans_one_default_per_owner_type_idx")
      .on(table.ownerType)
      .where(sql`${table.isDefault} = true AND ${table.organizationId} IS NULL`),
  ],
);

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ one }) => ({
  organization: one(organization, {
    fields: [subscriptionPlans.organizationId],
    references: [organization.id],
  }),
}));

// Persisted, per-user notification inbox — the durability half of the notification
// system (see specs/notifications-plan.md). Real-time delivery (the WebSocket
// dispatcher, apps/api/src/modules/notifications/channels/websocket-channel.ts) is a
// best-effort convenience on top of this; this row is what guarantees a notification
// is never lost just because its recipient wasn't online when it fired. FK'd to
// `user.id` directly — works identically for an individual, an org member, or platform
// staff, since Better Auth's `user` table already unifies all three (no per-audience
// notification table needed).
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Where clicking the notification should take you — e.g. the organization/billing
    // page the event concerns. Nullable: not every notification needs a destination.
    actionUrl: text("action_url"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_userId_idx").on(table.userId),
    // Backs the unread-count/unread-list queries specifically — the vast majority of
    // reads against this table are "my unread notifications," not "all of them".
    index("notification_userId_read_idx").on(table.userId, table.read),
  ],
);

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
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
