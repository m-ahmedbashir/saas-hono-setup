import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailVerifiedView } from "./email-verified-view";

const sendVerificationEmailMock = vi.fn();
const useSessionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    sendVerificationEmail: (...args: unknown[]) => sendVerificationEmailMock(...args),
  },
  useSession: () => useSessionMock(),
}));

const signedIn = { data: { user: { email: "ada@example.com", emailVerified: false } } };
const signedOut = { data: null };

describe("EmailVerifiedView", () => {
  beforeEach(() => {
    sendVerificationEmailMock.mockReset();
    useSessionMock.mockReturnValue(signedOut);
  });

  it("confirms a verified email and continues to the profile", () => {
    render(<EmailVerifiedView />);
    expect(screen.getByText(/email verified/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue/i })).toHaveAttribute("href", "/profile");
  });

  it.each(["TOKEN_EXPIRED", "INVALID_TOKEN"])(
    "explains a %s link to a signed-out visitor and sends them to sign in to get a new one",
    (error) => {
      render(<EmailVerifiedView error={error} />);
      expect(screen.getByText(/expired or was already used/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
        "href",
        "/auth/sign-in?redirect=%2Fprofile",
      );
      expect(screen.queryByRole("button", { name: /send a new link/i })).not.toBeInTheDocument();
    },
  );

  it("lets a signed-in, unverified user send a new link straight away", async () => {
    useSessionMock.mockReturnValue(signedIn);
    sendVerificationEmailMock.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    render(<EmailVerifiedView error="TOKEN_EXPIRED" />);

    await user.click(screen.getByRole("button", { name: /send a new link/i }));

    expect(sendVerificationEmailMock).toHaveBeenCalledWith({ email: "ada@example.com" });
    expect(await screen.findByText(/sent a new link to ada@example.com/i)).toBeInTheDocument();
  });

  it("explains a link meant for a different account than the signed-in one", () => {
    useSessionMock.mockReturnValue(signedIn);
    render(<EmailVerifiedView error="INVALID_USER" />);
    expect(screen.getByText(/different account/i)).toBeInTheDocument();
  });

  it("falls back to a generic explanation for any other error", () => {
    render(<EmailVerifiedView error="USER_NOT_FOUND" />);
    expect(screen.getByText(/couldn't verify/i)).toBeInTheDocument();
  });
});
