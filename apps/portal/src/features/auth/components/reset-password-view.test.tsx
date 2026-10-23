import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetPasswordView } from "./reset-password-view";

const resetPasswordMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: { resetPassword: (...args: unknown[]) => resetPasswordMock(...args) },
}));

async function fillPasswords(password: string, confirm = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
  await user.click(screen.getByRole("button", { name: /set new password/i }));
}

describe("ResetPasswordView", () => {
  beforeEach(() => resetPasswordMock.mockReset());

  it("explains a link with no token and offers a new one, without showing the form", () => {
    render(<ResetPasswordView />);
    expect(screen.getByText(/link is incomplete/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new link/i })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("enforces the password rules before calling the network", async () => {
    render(<ResetPasswordView token="tok_1" />);

    await fillPasswords("short");
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();

    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("requires both passwords to match", async () => {
    render(<ResetPasswordView token="tok_1" />);

    await fillPasswords("long-enough-1", "long-enough-2");
    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("sets the new password with the token, then points to sign-in", async () => {
    resetPasswordMock.mockResolvedValue({ data: { status: true }, error: null });
    render(<ResetPasswordView token="tok_1" />);

    await fillPasswords("brand-new-password");

    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
    expect(resetPasswordMock).toHaveBeenCalledWith({
      newPassword: "brand-new-password",
      token: "tok_1",
    });
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/auth/sign-in");
  });

  it("explains an expired or already-used link and offers a new one", async () => {
    resetPasswordMock.mockResolvedValue({
      data: null,
      error: { status: 400, code: "INVALID_TOKEN", message: "Invalid token" },
    });
    render(<ResetPasswordView token="tok_used" />);

    await fillPasswords("brand-new-password");

    expect(await screen.findByText(/expired or was already used/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new link/i })).toBeInTheDocument();
  });
});
