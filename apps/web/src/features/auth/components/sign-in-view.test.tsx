import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInView } from "./sign-in-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const signInEmailMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signInEmailMock(...args) } },
}));

// Mocks only the two real I/O boundaries (navigation, the network call to apps/api) —
// everything else (Zod validation, TanStack Form state, error rendering) runs for real.
describe("SignInView", () => {
  beforeEach(() => {
    pushMock.mockReset();
    signInEmailMock.mockReset();
  });

  it("renders email and password fields", () => {
    render(<SignInView />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("shows a validation error for an invalid email and never calls the network", async () => {
    const user = userEvent.setup();
    render(<SignInView />);

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(signInEmailMock).not.toHaveBeenCalled();
  });

  it("calls authClient.signIn.email with the entered credentials on valid submit", async () => {
    signInEmailMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const user = userEvent.setup();
    render(<SignInView />);

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/password/i), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(signInEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: "person@example.com", password: "password1234" }),
      ),
    );
  });

  it("redirects to /dashboard/overview after a successful sign-in", async () => {
    signInEmailMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const user = userEvent.setup();
    render(<SignInView />);

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/password/i), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard/overview"));
  });

  it("shows the server's error message and does not redirect when sign-in fails", async () => {
    signInEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid email or password" },
    });
    const user = userEvent.setup();
    render(<SignInView />);

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
