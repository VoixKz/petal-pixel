import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({
  signIn: vi.fn(async () => undefined),
  signUp: vi.fn(async () => undefined),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast }));

import Login from "./Login";
import Signup from "./Signup";

const deepLink = [{ pathname: "/login", state: { from: { pathname: "/create", search: "?name=Anna" } } }];

beforeEach(() => vi.clearAllMocks());

describe("Login", () => {
  it("hands off to the provider and keeps the deep link", async () => {
    render(<MemoryRouter initialEntries={deepLink}><Login /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith("/create?name=Anna"));
  });

  it("returns home without a deep link", async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith("/"));
  });

  it("collects no password itself", () => {
    const { container } = render(<MemoryRouter><Login /></MemoryRouter>);

    expect(container.querySelector("input")).toBeNull();
  });

  it("says so and lets the user retry when the provider is down", async () => {
    auth.signIn.mockRejectedValueOnce(new Error("network"));
    render(<MemoryRouter><Login /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect((screen.getByRole("button", { name: "Sign In" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Signup", () => {
  it("opens registration and keeps the deep link", async () => {
    render(<MemoryRouter initialEntries={deepLink}><Signup /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith("/create?name=Anna"));
  });
});
