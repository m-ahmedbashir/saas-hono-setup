import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyEmailNotice } from "./verify-email-notice";

let session: { user: { email: string; emailVerified: boolean } } | null = null;
const sendVerificationEmailMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: session, isPending: false }),
  authClient: {
    sendVerificationEmail: (...args: unknown[]) => sendVerificationEmailMock(...args),
  },
}));

// Mocks only the session hook and the network call; rendering and state run for real.
describe("VerifyEmailNotice", () => {
  beforeEach(() => {
    sendVerificationEmailMock.mockReset();
    session = { user: { email: "ada@example.com", emailVerified: false } };
  });

  it("is hidden once the email is verified", () => {
    session = { user: { email: "ada@example.com", emailVerified: true } };
    render(<VerifyEmailNotice />);
    expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
  });

  it("is hidden without a session", () => {
    session = null;
    render(<VerifyEmailNotice />);
    expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
  });

  it("asks an unverified user to verify, naming their address", () => {
    render(<VerifyEmailNotice />);
    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
  });

  it("resends the verification email for the session's address", async () => {
    sendVerificationEmailMock.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    render(<VerifyEmailNotice />);

    await user.click(screen.getByRole("button", { name: /resend email/i }));

    expect(sendVerificationEmailMock).toHaveBeenCalledWith({ email: "ada@example.com" });
    expect(await screen.findByText(/sent another link/i)).toBeInTheDocument();
  });

  it("explains a rate-limit refusal", async () => {
    sendVerificationEmailMock.mockResolvedValue({
      data: null,
      error: { status: 429, message: "Too many requests" },
    });
    const user = userEvent.setup();
    render(<VerifyEmailNotice />);

    await user.click(screen.getByRole("button", { name: /resend email/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.queryByText(/sent another link/i)).not.toBeInTheDocument();
  });

  it("can be dismissed", async () => {
    const user = userEvent.setup();
    render(<VerifyEmailNotice />);

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
  });
});
