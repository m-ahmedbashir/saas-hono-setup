---
name: nextjs-shadcn-frontend
description: Build production-ready Next.js UI features in apps/admin using shadcn/ui, TanStack Form, React Query, and the project's auth/data conventions. Use for new pages, feature slices, dialogs, tables, forms, or dashboards.
---

# Next.js + Shadcn Frontend Feature Build

## One-Shot Invocation Protocol

When asked to build any UI feature in `apps/admin`, run this protocol once and produce the full feature. Do not scaffold placeholders or leave files half-written.

### 1. Surface Definition (state before writing code)

Reply with a compact markdown block:

1. **Surface type**: `data-dense layout` | `utility widget` | `nested flow` | `marketing page`.
2. **Route**: exact URL path under `app/`, e.g. `/dashboard/users`.
3. **Data source**: real API endpoint in `apps/api` or local/browser-only state.
4. **User states**: list the states you will handle — `empty`, `loading`, `error`, `no permission`, `populated`, `partial selection`, `submitting`, `success`, `delete confirmation`.
5. **Justified layout choice**: name one intentional non-card layout decision (e.g. full-width table with sticky header, split-pane detail, timeline, command palette).

### 2. Required File Set

Create exactly these files unless a smaller set is justified in the Surface Definition:

| File                                                                     | Purpose                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `apps/admin/src/app/<route>/page.tsx`                                    | Server Component route entry. Loads data, sets metadata, renders the feature view. |
| `apps/admin/src/features/<feature>/components/<feature>-view.tsx`        | Main client or server component. Keeps route file thin.                            |
| `apps/admin/src/features/<feature>/components/<feature>-skeleton.tsx`    | `Skeleton` fallback for `Suspense` or initial loading.                             |
| `apps/admin/src/features/<feature>/components/<feature>-empty-state.tsx` | Empty state with icon, headline, and optional CTA. Never a blank wrapper.          |
| `apps/admin/src/features/<feature>/components/<feature>-error-state.tsx` | Error state with retry action.                                                     |
| `apps/admin/src/features/<feature>/hooks/use-<feature>.ts`               | React Query hook for client data fetching.                                         |
| `apps/admin/src/features/<feature>/schemas/<feature>.schema.ts`          | Zod schema for any form.                                                           |
| `apps/admin/src/features/<feature>/types.ts`                             | Domain types if not derivable from API or schema.                                  |

### 3. Verification Before Finishing

Check the verification checklist at the bottom of this skill before declaring the task done.

---

## Project Conventions (non-negotiable)

### Stack

- Next.js 16, React 19, Tailwind CSS v4, shadcn/ui.
- Forms: TanStack Form via `@/components/ui/tanstack-form` (`useAppForm`, `useFormFields`).
- Auth: `better-auth/react` via `@/lib/auth-client.ts` (`useSession`, `signIn`, `signOut`).
- Data: React Query via `@/lib/query-client.ts` and `@/components/layout/query-provider`. Server fetch directly from `NEXT_PUBLIC_API_URL`.
- Routing guard: `apps/admin/src/proxy.ts` (uses `export const config = {...}`, **not** `proxyConfig`).
- Icons: `@/components/icons` (Tabler icons).

### Server vs Client Boundaries

- **Default to Server Component.** Add `"use client"` only if the file uses `useState`, `useEffect`, browser APIs, or interactive Radix primitives that require client tracking.
- Keep route `page.tsx` as a Server Component. Move interactivity into `features/<feature>/components/*`.
- Data fetching that needs polling, mutations, or caching → React Query hook in a Client Component.
- One-shot static data → fetch in the Server Component and pass as props.

### Data Fetching Rules

- Call `apps/api` directly at `NEXT_PUBLIC_API_URL`. No Next.js `/api/*` proxy layer.
- For server fetches, pass `cookies()` from `next/headers` if the endpoint needs the session cookie.
- For client fetches, use the React Query hook pattern below.
- Validate every API response with Zod before using it in render logic.

### Directory Structure

```
app/<route>/page.tsx
features/<feature>/
  components/<feature>-view.tsx
  components/<feature>-skeleton.tsx
  components/<feature>-empty-state.tsx
  components/<feature>-error-state.tsx
  hooks/use-<feature>.ts
  schemas/<feature>.schema.ts
  types.ts
```

Use `kebab-case` for file names and directories. Component exports use PascalCase.

---

## Component Architecture Rules

### Single Responsibility

- A `page.tsx` routes and loads data.
- A `*-view.tsx` composes the feature.
- A `*-skeleton.tsx` renders loading placeholders.
- A `*-empty-state.tsx` renders the empty case.
- A `*-error-state.tsx` renders the error case.
- A `use-*.ts` hook owns data fetching and mutations.
- A `*.schema.ts` owns form validation.

### Composition Over Props Drilling

- Prefer compound components over long prop lists.
- Example: a table page owns `<DataTable>` from `@/components/ui/table` and passes columns, not a monolithic `<UsersTable data={...} filter={...} pagination={...} />`.

### Avoid Nesting Cards

- Use `Card` only for isolated macro-containers (e.g. a single settings panel).
- Inside a container, use `divide-y divide-border` or `bg-muted/30` to separate sections.
- Never nest `Card` inside `Card`.

### Interactive States

- Every button, link, and focusable control must have explicit focus styles:
  ```tsx
  className = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  ```
- Disabled states use `disabled:opacity-50` and `disabled:cursor-not-allowed`.
- Loading buttons use `isLoading` or `disabled` + spinner, never a silent button.

### Defensive Text Layout

- Any flex container holding text must have `min-w-0` on the text wrapper.
- Text nodes must have `truncate`, `line-clamp-2`, or `break-words` to prevent layout breakage.
- Example:
  ```tsx
  <div className="flex min-w-0 items-center gap-2">
    <span className="truncate">{name}</span>
  </div>
  ```

---

## Tailwind + shadcn Rules

### Design Tokens Only

Use Tailwind's semantic theme classes mapped by shadcn. Never arbitrary values or custom hex codes.

| Use         | Token                                                 |
| ----------- | ----------------------------------------------------- |
| Background  | `bg-background`, `bg-muted`, `bg-muted/30`, `bg-card` |
| Foreground  | `text-foreground`, `text-muted-foreground`            |
| Borders     | `border-border`, `border-t`, `divide-y divide-border` |
| Rings       | `focus-visible:ring-ring`, `ring-ring`                |
| Primary     | `text-primary`, `bg-primary`, `hover:bg-primary/90`   |
| Destructive | `text-destructive`, `bg-destructive`                  |

### Spacing

Use standard spacing scale: `p-4`, `px-6`, `py-3`, `gap-4`, `space-y-2`. No `p-[17px]`.

### Typography

- Headings: `text-2xl font-semibold tracking-tight`, `text-lg font-medium`.
- Body: `text-sm`, `text-base`.
- Muted helper text: `text-muted-foreground`.

---

## Form Pattern

Use TanStack Form with the project's hook. Server validation is the authority; client-side Zod schemas are UX-only to fail fast.

```tsx
"use client";

import { useAppForm } from "@/components/ui/tanstack-form";
import { mySchema, type MyValues } from "../schemas/my.schema";

export function MyForm() {
  const form = useAppForm({
    defaultValues: { email: "" } as MyValues,
    validators: { onSubmit: mySchema },
    onSubmit: async ({ value }) => {
      // submit to API
    },
  });

  return (
    <form.AppForm>
      <form.Form className="gap-5">
        <form.AppField name="email">
          {() => <form.TextField name="email" label="Email" />}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
```

For type-safe field names, use `useFormFields<TValues>()`:

```tsx
import { useFormFields } from "@/components/ui/tanstack-form";

const { FormTextField } = useFormFields<MyValues>();
```

### Form UX Rules

- Show field errors inline via `FormFieldError`.
- Show form-level errors in a `role="alert"` banner.
- Disable submit while submitting (`form.SubmitButton` already handles `isSubmitting`).
- Redirect or reset after success.

---

## Data Fetching Pattern

### React Query Hook

```tsx
// features/<feature>/hooks/use-<feature>.ts
"use client";

import { useQuery } from "@tanstack/react-query";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export function useFeatureList() {
  return useQuery({
    queryKey: ["feature", "list"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/feature`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load feature data");
      return res.json();
    },
  });
}
```

### Server Fetch in page.tsx

```tsx
import { cookies } from "next/headers";

export default async function Page() {
  const cookieStore = await cookies();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/feature`, {
    headers: { Cookie: cookieStore.toString() },
  });
  if (!res.ok) throw new Error("Failed to load");
  const data = await res.json();
  return <FeatureView data={data} />;
}
```

### URL State

Use `nuqs` for filter/search params, not manual `useState` that gets lost on refresh.

---

## Auth Pattern

- Read session via `const { data: session } = useSession()` from `@/lib/auth-client`.
- Organization switching uses `authClient.organization.setActive` from `organizationClient()`.
- Admin checks use `adminClient()`.
- Never build a custom auth REST layer on top of Better Auth.

---

## Table Pattern

For data-dense surfaces, use the existing `@/components/ui/table` components (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`) and the TanStack `DataTable` component (`@/components/ui/table/data-table.tsx`).

- Always render an empty row when `rows.length === 0`.
- Use `data-table-skeleton.tsx` for initial loading, not inline spinner.
- Add pagination via `data-table-pagination.tsx`.
- Add filters via `data-table-faceted-filter.tsx` or `data-table-toolbar.tsx`.
- Sticky header: `bg-muted sticky top-0 z-10` on `TableHeader`.

---

## Loading, Empty, and Error States

### Loading

- Server route → use `loading.tsx` next to `page.tsx` or a `Suspense` boundary with `<FeatureSkeleton />`.
- Client component → use React Query `isPending` with `<FeatureSkeleton />`.
- Skeleton must match the final layout shape to avoid layout shift.

```tsx
export function FeatureSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
```

### Empty

```tsx
export function FeatureEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <Icons.inbox className="text-muted-foreground h-10 w-10" />
      <h3 className="mt-4 text-sm font-medium">No items yet</h3>
      <p className="text-muted-foreground mt-1 text-sm">Create your first item to get started.</p>
    </div>
  );
}
```

### Error

```tsx
"use client";

export function FeatureErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <Icons.alertCircle className="text-destructive h-10 w-10" />
      <h3 className="mt-4 text-sm font-medium">Something went wrong</h3>
      <p className="text-muted-foreground mt-1 text-sm">We could not load this data.</p>
      <Button onClick={retry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}
```

---

## Dialog / Drawer / Sheet Pattern

- Use `Dialog` for focused, modal tasks (forms, confirmations).
- Use `Drawer` or `Sheet` for side panels with detail or navigation.
- Trigger button lives in the view component. Content component is the dialog body.
- For destructive actions, use an explicit confirmation with the destructive style.

---

## Testing

- Add a test file next to the component: `FeatureView.test.tsx`.
- Use Vitest + React Testing Library + jsdom.
- Mock only I/O boundaries: `next/navigation`, `authClient.*`, and `fetch` calls.
- Test real rendering, form validation, and user interactions.
- Reference: `apps/admin/src/features/auth/components/sign-in-view.test.tsx`.

---

## Verification Checklist

Before finishing any frontend feature:

- [ ] Route `page.tsx` is a Server Component unless justified otherwise.
- [ ] `Suspense`/`loading.tsx` handles loading with a matching skeleton.
- [ ] Empty state renders for zero-length arrays.
- [ ] Error state renders with retry action.
- [ ] All interactive elements have explicit `focus-visible` ring styles.
- [ ] No arbitrary Tailwind values or custom hex codes.
- [ ] Text in flex containers uses `min-w-0` + `truncate`/`line-clamp-*`.
- [ ] Forms use `useAppForm` from `@/components/ui/tanstack-form` with Zod validators.
- [ ] Data fetches target `NEXT_PUBLIC_API_URL` directly, not a Next.js proxy.
- [ ] Auth uses `authClient` from `@/lib/auth-client`.
- [ ] No nested `Card` components; use `divide-y` or `bg-muted/30` instead.
- [ ] TypeScript strict mode passes: `pnpm --filter @repo/admin typecheck`.
- [ ] Lint passes: `pnpm --filter @repo/admin lint`.
- [ ] Tests pass: `pnpm --filter @repo/admin test`.
