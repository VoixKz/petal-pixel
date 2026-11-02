import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({
  session: null as null | { id: string },
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
}));

vi.mock("@/integrations/auth", () => ({ usesPasswordForm: true }));
vi.mock("@/integrations/auth/neon", () => ({
  signInWithGoogle: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

import Login from "./Login";
import Signup from "./Signup";

const open = (page: JSX.Element) => render(<MemoryRouter>{page}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  auth.session = null;
});

describe("the password sign-in form", () => {
  it("signs in with what was typed", async () => {
    auth.signInWithPassword.mockResolvedValue(undefined);
    open(<Login />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " anna@example.test " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith("anna@example.test", "long-enough"));
  });

  it("shows why it failed and lets the person try again", async () => {
    auth.signInWithPassword.mockRejectedValue(new Error("That email and password don't match."));
    open(<Login />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "anna@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don't match.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("offers the ways out of a failed sign-in", () => {
    open(<Login />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
  });
});

describe("the sign-up form", () => {
  it("states the password rule next to the field", () => {
    open(<Signup />);
    const password = screen.getByLabelText(/Password/);
    expect(password).toHaveAttribute("minlength", "8");
    expect(password).toHaveAccessibleDescription("At least 8 characters.");
  });

  it("creates the account with the name, email and password", async () => {
    auth.signUpWithPassword.mockResolvedValue(undefined);
    open(<Signup />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "anna@example.test" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "long-enough" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(auth.signUpWithPassword).toHaveBeenCalledWith("Anna", "anna@example.test", "long-enough"));
  });
});
