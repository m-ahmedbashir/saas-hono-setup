import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordView } from "./forgot-password-view";

const requestPasswordResetMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...args: unknown[]) => requestPasswordResetMock(...args),
  },
}));

// Mocks only the network call; validation, form state and rendering run for real.
describe("ForgotPasswordView", () => {
  beforeEach(() => requestPasswordResetMock.mockReset());

  it("rejects an invalid email without calling the network", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordView />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it("requests a reset for the entered email and confirms without saying whether it exists", async () => {
    requestPasswordResetMock.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordView />);

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(
      await screen.findByText(/if an account exists for ada@example.com/i),
    ).toBeInTheDocument();
    expect(requestPasswordResetMock).toHaveBeenCalledWith({ email: "ada@example.com" });
  });

  it("explains a rate-limit refusal instead of claiming the email was sent", async () => {
    requestPasswordResetMock.mockResolvedValue({
      data: null,
      error: { status: 429, message: "Too many requests" },
    });
    const user = userEvent.setup();
    render(<ForgotPasswordView />);

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.queryByText(/if an account exists/i)).not.toBeInTheDocument();
  });
});
