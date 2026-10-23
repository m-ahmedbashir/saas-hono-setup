import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@repo/shared/query-client";
import { CellAction } from "./cell-action";
import type { SubscriptionPlan } from "../../api/service";

// Mocks only global fetch (apps/api). The menu, mutation and request building run for real.
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response(JSON.stringify({ success: true, data: {} })),
);

beforeEach(() => {
  getQueryClient().clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

// Stored before `custom_branding` / `maxApiRequestsPerMonth` existed — the row's JSONB
// lacks them, but the update endpoint requires every known key.
const legacyPlan: SubscriptionPlan = {
  id: "plan_1",
  ownerType: "organization",
  planId: "growth",
  organizationId: null,
  name: "Growth",
  description: null,
  seatLimit: 10,
  providerPriceId: "price_1",
  features: { priority_support: true, advanced_analytics: false, api_access: true },
  limits: { maxProjects: 5 },
  isActive: true,
  isDefault: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("subscription plan row actions", () => {
  it("deactivating a plan stored before a feature key existed sends the complete key set", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={getQueryClient()}>
        <CellAction data={legacyPlan} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(await screen.findByRole("menuitem", { name: /deactivate/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:8787/subscription-plans/plan_1");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      isActive: false,
      features: {
        priority_support: true,
        advanced_analytics: false,
        api_access: true,
        custom_branding: false,
      },
      limits: { maxProjects: 5, maxApiRequestsPerMonth: 0 },
    });
  });
});
