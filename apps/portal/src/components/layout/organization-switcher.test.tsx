import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrganizationSwitcher } from "./organization-switcher";

// Mocks only Better Auth's client (its reactive hooks + the setActive network call).
// The switcher, the shared useSwitchOrganization hook and React Query run for real.
const useListOrganizationsMock = vi.fn();
const useActiveOrganizationMock = vi.fn();
const setActiveMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useListOrganizations: () => useListOrganizationsMock(),
    useActiveOrganization: () => useActiveOrganizationMock(),
    organization: { setActive: (...a: unknown[]) => setActiveMock(...a) },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const organizations = [
  { id: "org_acme", name: "Acme" },
  { id: "org_globex", name: "Globex" },
];

function renderSwitcher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <OrganizationSwitcher />
    </QueryClientProvider>,
  );
  return { invalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
  useListOrganizationsMock.mockReturnValue({ data: organizations });
  useActiveOrganizationMock.mockReturnValue({ data: { id: "org_acme", name: "Acme" } });
  setActiveMock.mockResolvedValue({ data: {}, error: null });
});

describe("OrganizationSwitcher", () => {
  // An individual with no organization still needs a way to start one (specs/
  // organization-self-serve-plan.md), so the switcher shows for them too.
  it("offers someone in no organization their personal account and a way to create one", async () => {
    useListOrganizationsMock.mockReturnValue({ data: [] });
    useActiveOrganizationMock.mockReturnValue({ data: null });
    renderSwitcher();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Switch account (current: Personal account)" }),
    );
    expect(await screen.findByRole("menuitem", { name: /personal account/i })).toBeInTheDocument();
    expect(screen.queryByText("Organizations")).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /create organization/i }));
    expect(pushMock).toHaveBeenCalledWith("/organization/new");
  });

  it("isn't shown while the organization list is still loading", () => {
    useListOrganizationsMock.mockReturnValue({ data: null });
    renderSwitcher();
    expect(screen.queryByRole("button", { name: /switch account/i })).not.toBeInTheDocument();
  });

  it("offers to create another organization alongside the existing ones", async () => {
    renderSwitcher();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /switch account/i }));
    await user.click(await screen.findByRole("menuitem", { name: /create organization/i }));
    expect(pushMock).toHaveBeenCalledWith("/organization/new");
  });

  it("names the account the portal is currently acting for", () => {
    renderSwitcher();
    expect(
      screen.getByRole("button", { name: "Switch account (current: Acme)" }),
    ).toBeInTheDocument();
  });

  it("reads as the personal account when no organization is active", () => {
    useActiveOrganizationMock.mockReturnValue({ data: null });
    renderSwitcher();
    expect(
      screen.getByRole("button", { name: "Switch account (current: Personal account)" }),
    ).toBeInTheDocument();
  });

  // specs/customer-portal-plan.md: an org switch must invalidate cached data, or billing
  // could keep showing the previous organization's plan until an unrelated refetch.
  it("switches organization and clears every cached query", async () => {
    const { invalidate } = renderSwitcher();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /switch account/i }));
    await user.click(await screen.findByRole("menuitem", { name: /globex/i }));

    await waitFor(() =>
      expect(setActiveMock).toHaveBeenCalledWith({ organizationId: "org_globex" }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
  });

  it("switches back to the personal account", async () => {
    renderSwitcher();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /switch account/i }));
    await user.click(await screen.findByRole("menuitem", { name: /personal account/i }));

    await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith({ organizationId: null }));
  });

  it("doesn't clear the cache when the switch fails", async () => {
    setActiveMock.mockResolvedValue({ data: null, error: { message: "Not a member" } });
    const { invalidate } = renderSwitcher();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /switch account/i }));
    await user.click(await screen.findByRole("menuitem", { name: /globex/i }));

    await waitFor(() => expect(setActiveMock).toHaveBeenCalled());
    expect(invalidate).not.toHaveBeenCalled();
  });
});
