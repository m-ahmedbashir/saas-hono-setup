import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignUpView } from "./sign-up-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const signUpEmailMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: (...args: unknown[]) => signUpEmailMock(...args) } },
}));

// Mocks only the two real I/O boundaries (navigation, the network call to apps/api) —
// everything else (Zod validation, TanStack Form state, error rendering) runs for real.
// Mirrors sign-in-view.test.tsx's structure.
describe("SignUpView", () => {
  beforeEach(() => {
    pushMock.mockReset();
    signUpEmailMock.mockReset();
  });

  it("renders name, email, and password fields", () => {
    render(<SignUpView />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows a validation error for a too-short password and never calls the network", async () => {
    const user = userEvent.setup();
    render(<SignUpView />);

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });

  it("calls authClient.signUp.email with the entered values on valid submit", async () => {
    signUpEmailMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const user = userEvent.setup();
    render(<SignUpView />);

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(signUpEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Ada Lovelace",
          email: "ada@example.com",
          password: "password1234",
        }),
      ),
    );
  });

  it("redirects to /profile after a successful sign-up (autoSignIn already established a session)", async () => {
    signUpEmailMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const user = userEvent.setup();
    render(<SignUpView />);

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/profile"));
  });

  it("shows the server's error message and does not redirect when sign-up fails", async () => {
    signUpEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Email already in use" },
    });
    const user = userEvent.setup();
    render(<SignUpView />);

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/email already in use/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
