import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@repo/shared/query-client";
import { BillingView } from "./billing-view";

// Mocks only the real I/O boundaries — global fetch (apps/api), authClient (Better
// Auth's network calls), next/navigation, and window.location (the redirect to Stripe).
// Query state, mutations, permission gating and rendering all run for real, against the
// same getQueryClient() singleton the mutations invalidate.

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const useActiveOrganizationMock = vi.fn();
const hasPermissionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useActiveOrganization: () => useActiveOrganizationMock(),
    organization: { hasPermission: (...args: unknown[]) => hasPermissionMock(...args) },
  },
}));

type Route = { status?: number; body: unknown };
let routes: Record<string, Route>;
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
  const path = url.replace(/^.*?(\/billing\/)/, "/billing/");
  const route = routes[path];
  if (!route) throw new Error(`Unmocked request: ${url}`);
  return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
});

const assignMock = vi.fn();

const ok = (data: unknown): Route => ({ body: { success: true, data } });

const individualPlans = ok({
  plans: [
    { planId: "individual_free", name: "Free", description: null, isPurchasable: false },
    { planId: "individual_pro", name: "Pro", description: "Everything", isPurchasable: true },
  ],
});

function renderView() {
  return render(
    <QueryClientProvider client={getQueryClient()}>
      <BillingView />
    </QueryClientProvider>,
  );
}

function requestsTo(path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));
}

// The JSON body and Idempotency-Key header of every request sent to `path`, in order.
function sentTo(path: string) {
  return requestsTo(path).map(([, init]) => ({
    body: JSON.parse(String(init?.body)) as unknown,
    // Read the way the browser does — headers may be any valid HeadersInit form.
    idempotencyKey: new Headers(init?.headers).get("Idempotency-Key") ?? undefined,
  }));
}

beforeEach(() => {
  getQueryClient().clear();
  getQueryClient().setDefaultOptions({ queries: { retry: false, staleTime: 0 } });
  searchParams = new URLSearchParams();
  fetchMock.mockClear();
  assignMock.mockReset();
  useActiveOrganizationMock.mockReset();
  hasPermissionMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: assignMock },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BillingView — individual (no active organization)", () => {
  beforeEach(() => {
    useActiveOrganizationMock.mockReturnValue({ data: null, isPending: false });
  });

  it("shows the current plan by name and offers the other purchasable plan", async () => {
    routes = {
      "/billing/individual": ok({ plan: "individual_free", subscriptionStatus: null }),
      "/billing/individual-plans": individualPlans,
    };
    renderView();

    expect(await screen.findByRole("heading", { name: "Free", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel subscription/i })).not.toBeInTheDocument();
  });

  it("starts checkout with an Idempotency-Key and redirects to Stripe", async () => {
    routes = {
      "/billing/individual": ok({ plan: "individual_free", subscriptionStatus: null }),
      "/billing/individual-plans": individualPlans,
      "/billing/individual-checkout": ok({ checkoutUrl: "https://checkout.stripe.com/c/1" }),
    };
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Choose plan" }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("https://checkout.stripe.com/c/1"));
    const [sent] = sentTo("/billing/individual-checkout");
    expect(sent?.body).toEqual({ planId: "individual_pro" });
    expect(sent?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses the same Idempotency-Key when the same checkout is retried after a failure", async () => {
    routes = {
      "/billing/individual": ok({ plan: "individual_free", subscriptionStatus: null }),
      "/billing/individual-plans": individualPlans,
      "/billing/individual-checkout": {
        status: 500,
        body: { success: false, error: { code: "INTERNAL_ERROR", message: "Stripe is down" } },
      },
    };
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Choose plan" }));
    expect(await screen.findByText("Stripe is down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose plan" }));

    await waitFor(() => expect(requestsTo("/billing/individual-checkout")).toHaveLength(2));
    const [first, retry] = sentTo("/billing/individual-checkout");
    expect(first?.idempotencyKey).toBeTruthy();
    expect(retry?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("with a live subscription, offers cancel instead of a second checkout", async () => {
    routes = {
      "/billing/individual": ok({ plan: "individual_pro", subscriptionStatus: "active" }),
      "/billing/individual-plans": individualPlans,
      "/billing/individual-cancel": ok({ canceled: true }),
    };
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose plan" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel subscription" }));

    // Stripe's webhook hasn't landed yet, so the row still reads "active" — the page must
    // not offer Cancel again while it waits.
    expect(await screen.findByText(/cancellation requested/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
    expect(requestsTo("/billing/individual-cancel")).toHaveLength(1);

    // The webhook lands: the row returns to the default plan. Polling picks it up without a
    // reload, and Pro — the plan just canceled — can be bought again.
    routes["/billing/individual"] = ok({ plan: "individual_free", subscriptionStatus: "canceled" });
    expect(
      await screen.findByText("Your previous subscription has ended", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cancellation requested/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Canceled")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose plan" })).toBeInTheDocument();
  }, 10000);

  it("shows an error state with a working retry when billing fails to load", async () => {
    routes = {
      "/billing/individual": {
        status: 500,
        body: {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Database unavailable" },
        },
      },
      "/billing/individual-plans": individualPlans,
    };
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    routes["/billing/individual"] = ok({ plan: "individual_free", subscriptionStatus: null });
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Free", level: 2 })).toBeInTheDocument();
  });

  it("acknowledges a successful return from Stripe Checkout", async () => {
    searchParams = new URLSearchParams("checkout=success");
    routes = {
      "/billing/individual": ok({ plan: "individual_free", subscriptionStatus: null }),
      "/billing/individual-plans": individualPlans,
    };
    renderView();

    expect(await screen.findByText("Payment received")).toBeInTheDocument();
  });
});

describe("BillingView — organization", () => {
  const organizationRoutes = () => ({
    "/billing/organization": ok({ plan: "free", subscriptionStatus: null, seatQuantity: null }),
    "/billing/organization-plans": ok({
      plans: [
        { planId: "free", name: "Free", description: null, seatLimit: 3, isPurchasable: false },
        { planId: "growth", name: "Growth", description: null, seatLimit: 25, isPurchasable: true },
      ],
    }),
  });

  beforeEach(() => {
    useActiveOrganizationMock.mockReturnValue({
      data: { id: "org_1", name: "Acme", members: [{}, {}, {}] },
      isPending: false,
    });
  });

  it("shows a member without billing:manage the plan read-only, with no purchase actions", async () => {
    hasPermissionMock.mockResolvedValue({ data: { success: false }, error: null });
    routes = organizationRoutes();
    renderView();

    expect(await screen.findByText(/only organization owners and admins/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose plan" })).not.toBeInTheDocument();
    expect(hasPermissionMock).toHaveBeenCalledWith({ permissions: { billing: ["manage"] } });
  });

  it("marks a plan too small for the current team as unavailable instead of offering it", async () => {
    hasPermissionMock.mockResolvedValue({ data: { success: true }, error: null });
    routes = {
      ...organizationRoutes(),
      "/billing/organization-plans": ok({
        plans: [
          { planId: "free", name: "Free", description: null, seatLimit: 3, isPurchasable: false },
          { planId: "duo", name: "Duo", description: null, seatLimit: 2, isPurchasable: true },
        ],
      }),
    };
    renderView();

    expect(await screen.findByText("Fits up to 2 members — you have 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose plan" })).not.toBeInTheDocument();
  });

  it("lets an owner/admin check out a seat count, defaulting to the current member count", async () => {
    hasPermissionMock.mockResolvedValue({ data: { success: true }, error: null });
    routes = {
      ...organizationRoutes(),
      "/billing/organization-checkout": ok({ checkoutUrl: "https://checkout.stripe.com/c/org" }),
    };
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Choose plan" }));
    const seats = await screen.findByLabelText("Seats");
    expect(seats).toHaveValue(3);
    await user.click(screen.getByRole("button", { name: /continue to checkout/i }));

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith("https://checkout.stripe.com/c/org"),
    );
    const [sent] = sentTo("/billing/organization-checkout");
    expect(sent?.body).toEqual({ planId: "growth", quantity: 3 });
    expect(sent?.idempotencyKey).toBeTruthy();
  });

  it("rejects a seat count above the plan's limit without calling the network", async () => {
    hasPermissionMock.mockResolvedValue({ data: { success: true }, error: null });
    routes = organizationRoutes();
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Choose plan" }));
    const seats = await screen.findByLabelText("Seats");
    await user.clear(seats);
    await user.type(seats, "26");
    await user.click(screen.getByRole("button", { name: /continue to checkout/i }));

    expect(await screen.findByText(/at most 25 seats/i)).toBeInTheDocument();
    expect(requestsTo("/billing/organization-checkout")).toHaveLength(0);
  });

  it("rejects fewer seats than the organization has members without calling the network", async () => {
    hasPermissionMock.mockResolvedValue({ data: { success: true }, error: null });
    routes = organizationRoutes();
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Choose plan" }));
    const seats = await screen.findByLabelText("Seats");
    await user.clear(seats);
    await user.type(seats, "2");
    await user.click(screen.getByRole("button", { name: /continue to checkout/i }));

    expect(await screen.findByText(/at least 3 seats/i)).toBeInTheDocument();
    expect(requestsTo("/billing/organization-checkout")).toHaveLength(0);
  });
});
