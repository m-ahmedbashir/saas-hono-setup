import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AcceptInviteView } from "./accept-invite-view";

// Mocks only the I/O boundaries: navigation and Better Auth's client.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const useSessionMock = vi.fn();
const getInvitationMock = vi.fn();
const acceptInvitationMock = vi.fn();
const rejectInvitationMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
  authClient: {
    signOut: vi.fn(),
    organization: {
      getInvitation: (...a: unknown[]) => getInvitationMock(...a),
      acceptInvitation: (...a: unknown[]) => acceptInvitationMock(...a),
      rejectInvitation: (...a: unknown[]) => rejectInvitationMock(...a),
    },
  },
}));

const invitation = {
  id: "inv_1",
  email: "ada@example.com",
  role: "member",
  organizationName: "Acme",
  inviterEmail: "olive@example.com",
};

function renderView(
  { invitationId }: { invitationId: string | undefined } = { invitationId: "inv_1" },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AcceptInviteView invitationId={invitationId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSessionMock.mockReturnValue({
    data: { user: { id: "u_ada", email: "ada@example.com" } },
    isPending: false,
  });
  getInvitationMock.mockResolvedValue({ data: invitation, error: null });
});

describe("AcceptInviteView", () => {
  it("sends a signed-out visitor through sign-in or sign-up and back to this invitation", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    renderView();

    const back = encodeURIComponent("/auth/accept-invite?id=inv_1");
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/auth/sign-in?redirect=${back}`,
    );
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      `/auth/sign-up?redirect=${back}`,
    );
    expect(getInvitationMock).not.toHaveBeenCalled();
  });

  it("shows who invited you to what, then accepts and lands on the team", async () => {
    acceptInvitationMock.mockResolvedValue({ data: { invitation, member: {} }, error: null });
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByRole("heading", { name: "Join Acme" })).toBeInTheDocument();
    expect(
      screen.getByText(/olive@example.com invited you to join as member/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() =>
      expect(acceptInvitationMock).toHaveBeenCalledWith({ invitationId: "inv_1" }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/team"));
  });

  it("explains a full organization instead of a raw error when there's no free seat", async () => {
    acceptInvitationMock.mockResolvedValue({
      data: null,
      error: { message: "limit", code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED" },
    });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText(/has no free seats left/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("declines the invitation", async () => {
    rejectInvitationMock.mockResolvedValue({ data: { invitation }, error: null });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Invitation declined")).toBeInTheDocument();
    expect(rejectInvitationMock).toHaveBeenCalledWith({ invitationId: "inv_1" });
  });

  it("tells someone signed in with a different email that the invitation isn't theirs", async () => {
    getInvitationMock.mockResolvedValue({
      data: null,
      error: { message: "not recipient", code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION" },
    });
    renderView();

    expect(await screen.findByText("This invitation is for someone else")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("says plainly when an invitation has expired or was already used", async () => {
    getInvitationMock.mockResolvedValue({
      data: null,
      error: { message: "Invitation not found!" },
    });
    renderView();

    expect(await screen.findByText("This invitation is no longer valid")).toBeInTheDocument();
  });

  it("handles a link with no invitation id", async () => {
    renderView({ invitationId: undefined });
    expect(await screen.findByText("This invitation link is incomplete")).toBeInTheDocument();
  });
});
