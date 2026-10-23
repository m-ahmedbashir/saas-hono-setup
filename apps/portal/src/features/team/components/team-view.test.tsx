import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamView } from "./team-view";

// Mocks only the I/O boundary — Better Auth's client (network calls + its reactive hooks).
// Forms, validation, rendering, and the permission check itself (the real `roles` map from
// @repo/core, same as the server uses) all run for real.
const useSessionMock = vi.fn();
const useActiveOrganizationMock = vi.fn();
const useListOrganizationsMock = vi.fn();
const setActiveMock = vi.fn();
const inviteMemberMock = vi.fn();
const cancelInvitationMock = vi.fn();
const removeMemberMock = vi.fn();
const updateMemberRoleMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
  authClient: {
    useActiveOrganization: () => useActiveOrganizationMock(),
    useListOrganizations: () => useListOrganizationsMock(),
    organization: {
      setActive: (...a: unknown[]) => setActiveMock(...a),
      inviteMember: (...a: unknown[]) => inviteMemberMock(...a),
      cancelInvitation: (...a: unknown[]) => cancelInvitationMock(...a),
      removeMember: (...a: unknown[]) => removeMemberMock(...a),
      updateMemberRole: (...a: unknown[]) => updateMemberRoleMock(...a),
    },
  },
}));

const inFuture = new Date(Date.now() + 86_400_000).toISOString();
const inPast = new Date(Date.now() - 86_400_000).toISOString();

function member(id: string, userId: string, name: string, role: string) {
  return {
    id,
    userId,
    role,
    user: { id: userId, name, email: `${userId}@example.com`, image: null },
  };
}

const organization = {
  id: "org_1",
  name: "Acme",
  members: [
    member("m_owner", "u_owner", "Olive Owner", "owner"),
    member("m_ada", "u_ada", "Ada Admin", "admin"),
    member("m_max", "u_max", "Max Member", "member"),
  ],
  invitations: [
    {
      id: "inv_pending",
      email: "new@example.com",
      role: "member",
      status: "pending",
      expiresAt: inFuture,
    },
    {
      id: "inv_accepted",
      email: "done@example.com",
      role: "member",
      status: "accepted",
      expiresAt: inFuture,
    },
    {
      id: "inv_expired",
      email: "old@example.com",
      role: "member",
      status: "pending",
      expiresAt: inPast,
    },
  ],
};

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TeamView />
    </QueryClientProvider>,
  );
}

function signInAs(userId: string) {
  useSessionMock.mockReturnValue({ data: { user: { id: userId } }, isPending: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs("u_owner");
  useActiveOrganizationMock.mockReturnValue({ data: organization, isPending: false });
  useListOrganizationsMock.mockReturnValue({ data: [], isPending: false });
});

describe("TeamView", () => {
  it("explains that teams are for organizations when the user belongs to none", async () => {
    useActiveOrganizationMock.mockReturnValue({ data: null, isPending: false });
    renderView();
    expect(await screen.findByText("Teams are for organizations")).toBeInTheDocument();
  });

  // Better Auth doesn't pick an active organization at sign-in, so a member on a fresh
  // session has none yet — they must be able to open their org, not be told they have none.
  it("lets an org member on a fresh session (no active organization) choose their organization", async () => {
    useActiveOrganizationMock.mockReturnValue({ data: null, isPending: false });
    useListOrganizationsMock.mockReturnValue({
      data: [{ id: "org_1", name: "Acme" }],
      isPending: false,
    });
    setActiveMock.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText("Choose an organization")).toBeInTheDocument();
    expect(screen.queryByText("Teams are for organizations")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith({ organizationId: "org_1" }));
  });

  // proxy.ts only checks a session cookie exists — an expired or revoked one gets through.
  it("says the session has ended instead of loading forever when there's no valid session", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    renderView();
    expect(await screen.findByText("Your session has ended")).toBeInTheDocument();
  });

  it("lets an admin manage the team, from the real permission map rather than a role-name check", async () => {
    signInAs("u_ada");
    renderView();
    expect(await screen.findByRole("button", { name: /invite member/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Max Member" })).toBeInTheDocument();
    // Not on their own row, and not on the owner's.
    expect(screen.queryByRole("button", { name: "Actions for Ada Admin" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions for Olive Owner" }),
    ).not.toBeInTheDocument();
  });

  it("shows a plain member the team read-only, with no invite or row actions", async () => {
    signInAs("u_max");
    renderView();

    expect(await screen.findByText(/only organization owners and admins/i)).toBeInTheDocument();
    expect(screen.getByText("Ada Admin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /invite member/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions for/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Pending invitations")).not.toBeInTheDocument();
  });

  it("never offers actions on the owner's row or your own row", async () => {
    renderView();
    expect(
      await screen.findByRole("button", { name: "Actions for Ada Admin" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Max Member" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions for Olive Owner" }),
    ).not.toBeInTheDocument();
  });

  it("lists only pending, unexpired invitations, and cancels one", async () => {
    cancelInvitationMock.mockResolvedValue({ data: { id: "inv_pending" }, error: null });
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
    expect(screen.queryByText("done@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("old@example.com")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel invitation for new@example.com" }));
    await waitFor(() =>
      expect(cancelInvitationMock).toHaveBeenCalledWith({ invitationId: "inv_pending" }),
    );
  });

  it("invites someone, says they were emailed, and still offers a shareable link", async () => {
    inviteMemberMock.mockResolvedValue({ data: { id: "inv_new" }, error: null });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: /invite member/i }));
    await user.type(await screen.findByLabelText("Email"), "teammate@example.com");
    await user.click(screen.getByRole("button", { name: /create invitation/i }));

    await waitFor(() =>
      expect(inviteMemberMock).toHaveBeenCalledWith({
        email: "teammate@example.com",
        role: "member",
      }),
    );
    const link = (await screen.findByLabelText("Invitation link")) as HTMLInputElement;
    expect(link.value).toMatch(/\/auth\/accept-invite\?id=inv_new$/);
    expect(screen.getByText(/we've emailed them/i)).toBeInTheDocument();
    expect(screen.getByText(/you can also share this link/i)).toBeInTheDocument();
  });

  it("explains a full plan in plain words when the invite hits the seat limit", async () => {
    inviteMemberMock.mockResolvedValue({
      data: null,
      error: { message: "Invitation limit reached", code: "INVITATION_LIMIT_REACHED" },
    });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: /invite member/i }));
    await user.type(await screen.findByLabelText("Email"), "teammate@example.com");
    await user.click(screen.getByRole("button", { name: /create invitation/i }));

    expect(await screen.findByText(/every seat on your plan is taken/i)).toBeInTheDocument();
  });

  it("rejects an invalid email without calling the server", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: /invite member/i }));
    await user.type(await screen.findByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /create invitation/i }));

    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
    expect(inviteMemberMock).not.toHaveBeenCalled();
  });

  it("promotes a member to admin", async () => {
    updateMemberRoleMock.mockResolvedValue({ data: { id: "m_max" }, error: null });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Actions for Max Member" }));
    await user.click(await screen.findByRole("menuitem", { name: "Make admin" }));

    await waitFor(() =>
      expect(updateMemberRoleMock).toHaveBeenCalledWith({ memberId: "m_max", role: "admin" }),
    );
  });

  it("removes a member only after an explicit confirmation", async () => {
    removeMemberMock.mockResolvedValue({ data: { member: { id: "m_max" } }, error: null });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Actions for Max Member" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from team" }));
    expect(removeMemberMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(removeMemberMock).toHaveBeenCalledWith({ memberIdOrEmail: "m_max" }),
    );
  });
});
