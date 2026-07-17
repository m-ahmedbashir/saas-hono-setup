# MindLeague Core Architecture & Agents Manual

This document provides the complete, production-grade technical blueprint for the MindLeague workspace. Our platform is structured as a type-safe **Monorepo** orchestrating a high-performance **Hono API backend**, a **Drizzle ORM** database layer, and a decoupled **AI Agent Engine** with **ephemeral prompt caching**.

---

## 🛠️ 1. Monorepo & Backend Core Architecture

We do not build monolithic, tangled servers. We use a **Modular Monorepo** powered by **Turborepo** and **pnpm** to separate our code into deployable applications (`apps/`) and highly optimized, internal shared packages (`packages/`).

### The Architectural Pillars:

1. **Compile-Time End-to-End Type Safety (RPC):** We abandon manual API fetching clients. Hono compiles our routing structure and exports it as a TypeScript type (`AppType`). Our Next.js and Expo frontend applications import this single type, turning network requests into fully autocompleted, type-safe functions.
2. **Single Source of Truth (DRY Schema):** We never write manual TypeScript interfaces alongside our database tables or validation layers. Our **Zod Schemas** and **Drizzle Schemas** _are_ the absolute types. We use TypeScript's native type inference (`z.infer<typeof Schema>` and `typeof table.$inferSelect`) to eliminate type sync drift.
3. **Decoupled Business Logic (Hexagonal Pattern):** Our database adapters and external API integrations are treated as infrastructure. The core mathematical algorithms (like Bayesian Knowledge Tracing) and AI agent definitions live in `@repo/core` with zero physical dependencies on Hono, network sockets, or SQL clients.

---

## 📂 2. Core File & Folder Structure

```
my-mindleague-saas/
├── package.json                         # Monorepo configuration & runner scripts
├── pnpm-workspace.yaml                  # Workspace directory definitions
├── turbo.json                           # Turborepo caching & execution pipelines
├── .env.development                     # Local development credentials
├── .env.test                            # Test execution environment configurations
│
├── apps/                                # DEPLOYABLE APPLICATIONS
│   │
│   └── api/                             # HONO HIGH-PERFORMANCE BACKEND API
│       ├── src/
│       │   ├── index.ts                 # Central server entrypoint & router orchestration
│       │   │
│       │   ├── middleware/              # Global interceptors
│       │   │   ├── auth.middleware.ts   # Injects Better Auth & active organization context
│       │   │   └── security.middleware.ts # Configures secure HTTP headers (CORS, CSP, etc.)
│       │   │
│       │   └── modules/                 # FEATURE-BASED ROUTING SLICES
│       │       ├── auth/                # Auth mount endpoints
│       │       │   └── auth.routes.ts
│       │       │
│       │       └── student-progress/    # Progress engine slice
│       │           ├── progress.routes.ts
│       │           ├── progress.db.ts   # Database repository operations (Drizzle)
│       │           └── progress.schema.ts # HTTP schema validators (Zod)
│       │
│       ├── tests/                       # API INTEGRATION TESTING
│       │   ├── api.test.ts              # Native Hono testClient RPC integration tests
│       │   └── vitest.config.ts         # Vitest configurations
│       └── package.json
│
└── packages/                            # INTERNAL SHARED WORKSPACES
    │
    ├── db/                              # DATABASE SCHEMA & MIGRATIONS ENGINE
    │   ├── src/
    │   │   ├── index.ts                 # Instantiates Drizzle client (Node-Postgres)
    │   │   └── schema.ts                # Database schemas (Tables & relations)
    │   ├── migrations/                  # Automated, versioned SQL migration files
    │   └── package.json                 # Ships schemas dual-compiled via 'tshy'
    │
    └── core/                            # ENVIRONMENT-AGNOSTIC COGNITIVE ENGINE
        ├── src/
        │   ├── index.ts                 # Central barrel exports
        │   │
        │   ├── auth/                    # Better Auth engine config
        │   │   ├── index.ts             # Main config + Organization plugins
        │   │   └── permissions.ts       # Role-Based Access Control configurations
        │   │
        │   ├── algorithms/              # Pure mathematical logic (e.g., BKT-Scoring)
        │   │   ├── bkt-scoring.ts
        │   │   └── bkt.test.ts          # Isolated Unit Tests
        │   │
        │   └── ai/                      # Decoupled AI Agent Orchestration
        │       ├── client.ts            # LLM provider initialization
        │       ├── types.ts             # Contracts for agent strategy patterns
        │       ├── registry.ts          # Orchestrator & dispatcher
        │       └── agents/              # Individual single-file agents
        │           └── exercise-generator.ts
        └── package.json
```

---

## 🔀 3. Dynamic Multi-Tenant Auth Router (B2C vs B2B vs B2B2C)

To support individual players, business clients, and corporate-sponsored players through a single doorway, we utilize **Better Auth** with the native **Organization Plugin** integrated straight into our Hono API.

### The Identity State Resolution Flow

When a user authenticates, our Hono middleware evaluates their relationship boundaries at runtime to securely scope the application behavior:

```typescript
// apps/api/src/middleware/auth.middleware.ts
import { createMiddleware } from "hono/factory";
import { auth } from "@repo/core/auth";

export const injectUserContext = createMiddleware(async (c, next) => {
  // 1. Decrypt cookie and query session matching in PostgreSQL
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Unauthenticated User Session" }, 401);
  }

  // 2. Fetch any active tenant organization membership linked to the session
  const activeOrg = await auth.api.getFullOrganization({ headers: c.req.raw.headers });

  // 3. Resolve the hybrid business identity context
  if (activeOrg) {
    // 🏢 B2B / B2B2C Profile Mode (Clubs, Academies, Teams)
    c.set("userContext", {
      mode: "B2B2C",
      user: session.user,
      organizationId: activeOrg.id,
      roles: activeOrg.roles, // Pulls granular organization permissions
    });
  } else {
    // 🚀 Standard B2C Profile Mode (Individual Consumers)
    c.set("userContext", {
      mode: "B2C",
      user: session.user,
      organizationId: null,
      roles: ["consumer:basic"],
    });
  }

  await next();
});
```

---

## 📊 4. Type-Safe Data Shaping (Drizzle ORM)

We do not expose internal database rows, secret keys, or extra metadata fields to our clients. Instead of writing duplicate interfaces to strip values, we perform **Database-Level Selection**. Drizzle automatically infers the precise, shaped TypeScript structures:

```typescript
// apps/api/src/modules/student-progress/progress.db.ts
import { db } from "@repo/db";
import { users } from "@repo/db/schema";
import { eq } from "drizzle-orm";

export async function getStudentProfileSummary(userId: string) {
  const result = await db
    .select({
      // We SELECT only the necessary fields. Timestamps, internal IDs, and hashes are omitted.
      displayName: users.name,
      contactEmail: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
  // TypeScript automatically types the returned object exactly as:
  // { displayName: string; contactEmail: string; }
}
```

---

## ⚡ 5. Prompt Caching Strategy (AI Agent Optimization)

LLM execution can become expensive during long training sessions. To reduce operational costs by up to **90%** and maintain sub-second response speeds, our AI agents leverage **ephemeral prompt caching** at the model provider level.

### Prompt Ordering Discipline (The "Rule of Stability")

LLM caching systems read prompts from top to bottom. If even a single character changes in the middle of a string, the cache breaks for everything below it. To guarantee high cache-hit percentages, our agents strictly isolate dynamic variables at the very end of our message parameters:

```
┌──────────────────────────────────────────────────────────┐
│ [STABLE] System Guidelines & Context Rules               │ ──► CACHED (Hits 99.9% of the time)
│ [STABLE] Schema Rules & Output Interfaces                │ ──► CACHED (Hits 99.9% of the time)
├──────────────────────────────────────────────────────────┤
│ [DYNAMIC] User-Specific Request Variable (e.g., inputs)  │ ──► UNCACHED (Processed dynamically)
└──────────────────────────────────────────────────────────┘
```

### Type-Safe Agent Implementation (`exercise-generator.ts`)

```typescript
// packages/core/src/ai/agents/exercise-generator.ts
import { z } from "zod";
import { AIAgent } from "../types";

export const GeneratorInputSchema = z.object({
  topic: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "expert"]),
});

export const GeneratorOutputSchema = z.object({
  exerciseId: z.string(),
  questionText: z.string(),
  hints: z.array(z.string()),
  referenceAnswer: z.string(),
});

export const exerciseGenerator = {
  id: "exercise-generator",
  name: "Exercise Generator Agent",
  modelTier: "math",
  inputSchema: GeneratorInputSchema,
  outputSchema: GeneratorOutputSchema,

  generateSystemPrompt(input) {
    return `You are a cognitive math educator.
Generate an exercise on the topic of: ${input.topic}.
Ensure the challenge level matches: ${input.difficulty}.
Output your response strictly matching the required JSON schema.`;
  },
} satisfies AIAgent<typeof GeneratorInputSchema, typeof GeneratorOutputSchema>;
```
