import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalNav } from "./portal-nav";

// Mocks only the I/O boundaries: navigation and Better Auth's client.
vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useRouter: () => ({ push: vi.fn() }),
}));

const useListOrganizationsMock = vi.fn();
const useActiveOrganizationMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Ada Lovelace", email: "ada@example.com", image: null } },
  }),
  authClient: {
    signOut: vi.fn(),
    useListOrganizations: () => useListOrganizationsMock(),
    useActiveOrganization: () => useActiveOrganizationMock(),
    organization: { setActive: vi.fn() },
  },
}));

function renderNav() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PortalNav />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useListOrganizationsMock.mockReturnValue({ data: [] });
  useActiveOrganizationMock.mockReturnValue({ data: null });
});

describe("PortalNav", () => {
  // Base UI throws if a menu label isn't inside a menu group — the account menu must
  // actually open, not just render its trigger.
  it("opens the account menu with the user's details and sign out", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: /AL/ }));

    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("shows Team only to someone who belongs to an organization", () => {
    const { unmount } = renderNav();
    expect(screen.queryByRole("link", { name: "Team" })).not.toBeInTheDocument();
    unmount();

    useListOrganizationsMock.mockReturnValue({ data: [{ id: "org_1", name: "Acme" }] });
    renderNav();
    expect(screen.getByRole("link", { name: "Team" })).toBeInTheDocument();
  });
});
