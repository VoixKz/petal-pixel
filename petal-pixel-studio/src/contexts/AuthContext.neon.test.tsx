import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const neon = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));

vi.mock("@/integrations/auth", () => ({ usesPasswordForm: true }));
vi.mock("@/integrations/auth/neon", () => neon);
vi.mock("@/integrations/auth/oidc", () => ({
  userManager: { events: {} },
  redirectToSignIn: vi.fn(),
  redirectToSignUp: vi.fn(),
  signOutOfProvider: vi.fn(),
}));
vi.mock("@/integrations/garden/api", () => ({ getSignedInUserId: vi.fn(async () => null) }));
vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
  getMeViaGrpc: vi.fn(async () => ({ userId: "uuid-1", email: "anna@example.test", displayName: "Anna", avatarUrl: "" })),
}));

import { AuthProvider, useAuth } from "./AuthContext";
import { useFlowerStore } from "@/stores/flowerStore";

const anna = { id: "user-anna", email: "anna@example.test", emailVerified: false };
let auth: ReturnType<typeof useAuth>;

function Probe() {
  auth = useAuth();
  return <span data-testid="state">{auth.loading ? "loading" : auth.session?.id ?? "out"}</span>;
}

const renderAuth = () => render(<AuthProvider><Probe /></AuthProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  useFlowerStore.setState({ ownerUserId: null });
});

describe("AuthProvider with the password form", () => {
  it("restores the session from the provider", async () => {
    neon.restoreSession.mockResolvedValue(anna);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("user-anna"));
  });

  it("treats a failed restore as signed out instead of hanging", async () => {
    neon.restoreSession.mockRejectedValue(new Error("offline"));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
  });

  it("signs in and exposes the new session", async () => {
    neon.restoreSession.mockResolvedValue(null);
    neon.signInWithPassword.mockResolvedValue(anna);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));

    await act(() => auth.signInWithPassword("anna@example.test", "pw"));

    expect(screen.getByTestId("state")).toHaveTextContent("user-anna");
  });

  it("lets a failed sign-in reach the form", async () => {
    neon.restoreSession.mockResolvedValue(null);
    neon.signInWithPassword.mockRejectedValue(new Error("That email and password don't match."));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));

    await expect(auth.signInWithPassword("anna@example.test", "bad")).rejects.toThrow("don't match");
  });

  it("clears another person's cached flowers on sign-in", async () => {
    useFlowerStore.setState({ ownerUserId: "someone-else" });
    const reset = vi.spyOn(useFlowerStore.getState(), "resetFlowerStore");
    neon.restoreSession.mockResolvedValue(anna);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("user-anna"));
    expect(reset).toHaveBeenCalled();
  });

  it("signs out through the provider", async () => {
    neon.restoreSession.mockResolvedValue(anna);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("user-anna"));

    await act(() => auth.signOut());

    expect(neon.signOut).toHaveBeenCalled();
    expect(screen.getByTestId("state")).toHaveTextContent("out");
  });
});
