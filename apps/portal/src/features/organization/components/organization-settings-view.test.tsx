import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@repo/shared/query-client";
import { OrganizationSettingsView } from "./organization-settings-view";

// Mocks only I/O: global fetch (apps/api's /organization-profile) and Better Auth's client
// (its reactive hooks + the rename call). Forms, validation, the permission check (the real
// `roles` map from @repo/core) and rendering run for real.
const useSessionMock = vi.fn();
const useActiveOrganizationMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
  authClient: {
    useActiveOrganization: () => useActiveOrganizationMock(),
    organization: { update: (...a: unknown[]) => updateMock(...a) },
  },
}));

const profile = {
  orgNumber: "ABCD2345",
  industry: "Software",
  companySize: "11-50",
  website: "https://acme.test",
  phone: null,
  taxId: null,
  description: null,
  address: { street: null, city: "Berlin", state: null, postalCode: null, country: "DE" },
};

type Route = { status?: number; body: unknown };
let routes: Record<string, Route>;
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
  async (url, init) => {
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const route = routes[key];
    if (!route) throw new Error(`Unmocked request: ${key}`);
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  },
);

const ok = (data: unknown): Route => ({ body: { success: true, data } });

function sentTo(key: string) {
  return fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${new URL(url).pathname}` === key)
    .map(([, init]) => JSON.parse(String(init?.body)) as unknown);
}

function member(id: string, userId: string, role: string) {
  return { id, userId, role, user: { id: userId, name: userId, email: `${userId}@x.test` } };
}

const organization = {
  id: "org_1",
  name: "Acme",
  members: [
    member("m_owner", "u_owner", "owner"),
    member("m_admin", "u_admin", "admin"),
    member("m_member", "u_member", "member"),
  ],
  invitations: [],
};

function signInAs(userId: string) {
  useSessionMock.mockReturnValue({ data: { user: { id: userId } }, isPending: false });
}

function renderView() {
  return render(
    <QueryClientProvider client={getQueryClient()}>
      <OrganizationSettingsView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getQueryClient().clear();
  getQueryClient().setDefaultOptions({ queries: { retry: false, staleTime: 0 } });
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  routes = { "GET /organization-profile": ok(profile) };
  signInAs("u_owner");
  useActiveOrganizationMock.mockReturnValue({ data: organization, isPending: false });
  updateMock.mockResolvedValue({ data: { ...organization, name: "Acme Labs" }, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrganizationSettingsView", () => {
  it("asks the user to choose an organization when none is active", async () => {
    useActiveOrganizationMock.mockReturnValue({ data: null, isPending: false });
    renderView();

    expect(await screen.findByText("No organization selected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to team" })).toHaveAttribute("href", "/team");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the organization number read-only, never as an input", async () => {
    renderView();

    expect(await screen.findByText("ABCD2345")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("ABCD2345")).not.toBeInTheDocument();
  });

  it("lets an owner rename the organization", async () => {
    const user = userEvent.setup();
    renderView();

    const name = await screen.findByLabelText("Organization name");
    expect(name).toHaveValue("Acme");
    await user.clear(name);
    await user.type(name, "Acme Labs");
    await user.click(screen.getByRole("button", { name: /save name/i }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        organizationId: "org_1",
        data: { name: "Acme Labs" },
      }),
    );
    expect(await screen.findByText("Name updated")).toBeInTheDocument();
  });

  it("shows the server's refusal when a rename fails", async () => {
    updateMock.mockResolvedValue({
      data: null,
      error: {
        code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION",
        message: "You are not allowed to update this organization",
      },
    });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: /save name/i }));

    expect(
      await screen.findByText("Only owners and admins can change organization settings."),
    ).toBeInTheDocument();
  });

  it("saves only the fields that changed, a cleared one as null, never the organization number", async () => {
    routes["PATCH /organization-profile"] = ok({ ...profile, industry: "Robotics", website: null });
    const user = userEvent.setup();
    renderView();

    const industry = await screen.findByLabelText("Industry");
    expect(industry).toHaveValue("Software");
    await user.clear(industry);
    await user.type(industry, "Robotics");
    await user.clear(screen.getByLabelText("Website"));
    await user.clear(screen.getByLabelText("Country"));
    await user.type(screen.getByLabelText("Country"), "fr");
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => expect(sentTo("PATCH /organization-profile")).toHaveLength(1));
    const [body] = sentTo("PATCH /organization-profile");
    // Untouched fields are left out (PATCH: omitted = unchanged), so two admins editing
    // different fields at once don't overwrite each other's changes.
    expect(body).toEqual({ industry: "Robotics", website: null, address: { country: "FR" } });
    expect(body).not.toHaveProperty("orgNumber");
    expect(await screen.findByText("Profile updated")).toBeInTheDocument();
  });

  it("sends nothing when no field changed", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: /save profile/i }));

    expect(await screen.findByText("Profile updated")).toBeInTheDocument();
    expect(sentTo("PATCH /organization-profile")).toHaveLength(0);
  });

  it("compares a second save against what the first one saved", async () => {
    routes["PATCH /organization-profile"] = ok({ ...profile, industry: "Robotics" });
    const user = userEvent.setup();
    renderView();

    const industry = await screen.findByLabelText("Industry");
    await user.clear(industry);
    await user.type(industry, "Robotics");
    await user.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => expect(sentTo("PATCH /organization-profile")).toHaveLength(1));

    await user.type(screen.getByLabelText("Tax ID"), "DE123");
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => expect(sentTo("PATCH /organization-profile")).toHaveLength(2));
    expect(sentTo("PATCH /organization-profile")[1]).toEqual({ taxId: "DE123" });
  });

  it("rejects a website that isn't an http(s) address before sending anything", async () => {
    const user = userEvent.setup();
    renderView();

    const website = await screen.findByLabelText("Website");
    await user.clear(website);
    await user.type(website, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    expect(
      await screen.findByText("Enter a full web address starting with http:// or https://"),
    ).toBeInTheDocument();
    expect(sentTo("PATCH /organization-profile")).toHaveLength(0);
  });

  it("lets an admin edit too", async () => {
    signInAs("u_admin");
    renderView();

    expect(await screen.findByLabelText("Organization name")).toBeInTheDocument();
    expect(await screen.findByLabelText("Industry")).toBeInTheDocument();
  });

  it("shows a plain member everything read-only", async () => {
    signInAs("u_member");
    renderView();

    expect(await screen.findByText("Software")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Berlin")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    expect(
      screen.getByText("Only owners and admins can change organization settings."),
    ).toBeInTheDocument();
  });
});
