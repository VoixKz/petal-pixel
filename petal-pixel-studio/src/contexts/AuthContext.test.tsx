import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const oidc = vi.hoisted(() => {
  const listeners: Record<string, ((user?: unknown) => void) | undefined> = {};
  return {
    listeners,
    userManager: {
      getUser: vi.fn(),
      signinSilent: vi.fn(),
      events: {
        addUserLoaded: (cb: (user?: unknown) => void) => { listeners.loaded = cb; },
        removeUserLoaded: vi.fn(),
        addUserUnloaded: (cb: () => void) => { listeners.unloaded = cb; },
        removeUserUnloaded: vi.fn(),
      },
    },
    redirectToSignIn: vi.fn(async () => undefined),
    redirectToSignUp: vi.fn(async () => undefined),
    signOutOfProvider: vi.fn(async () => undefined),
  };
});

vi.mock("@/integrations/auth/oidc", () => oidc);
vi.mock("@/integrations/garden/api", () => ({ getSignedInUserId: vi.fn(async () => null) }));
vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
  getMeViaGrpc: vi.fn(async () => ({
    userId: "uuid-1",
    email: "anna@example.test",
    displayName: "Anna",
    avatarUrl: "",
  })),
}));

import { AuthProvider, useAuth } from "./AuthContext";
import { useFlowerStore } from "@/stores/flowerStore";

const anna = { expired: false, profile: { sub: "sub-anna", email: "anna@example.test" } };

let signOutRef: () => Promise<void>;

function Probe() {
  const { session, user, profile, loading, signOut } = useAuth();
  signOutRef = signOut;
  return (
    <div>
      <span data-testid="state">{loading ? "loading" : session ? "in" : "out"}</span>
      <span data-testid="id">{user?.id ?? ""}</span>
      <span data-testid="email">{user?.email ?? ""}</span>
      <span data-testid="name">{profile?.display_name ?? ""}</span>
    </div>
  );
}

function renderAuth() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const savedFlower = {
  id: "flw_1",
  title: "Old",
  generationWord: "old",
  createdAt: "2026-01-01",
  isMinted: false,
  params: useFlowerStore.getState().params,
};

beforeEach(() => {
  vi.clearAllMocks();
  useFlowerStore.setState({ savedFlowers: [], ownerUserId: null });
});

describe("AuthProvider", () => {
  it("stays signed out without a session", async () => {
    oidc.userManager.getUser.mockResolvedValue(null);

    renderAuth();

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("out"));
  });

  it("restores a live session and loads the profile", async () => {
    oidc.userManager.getUser.mockResolvedValue(anna);

    renderAuth();

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("in"));
    expect(screen.getByTestId("id").textContent).toBe("sub-anna");
    expect(screen.getByTestId("email").textContent).toBe("anna@example.test");
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("Anna"));
  });

  it("renews an expired session before giving up on it", async () => {
    oidc.userManager.getUser.mockResolvedValue({ ...anna, expired: true, refresh_token: "r" });
    oidc.userManager.signinSilent.mockResolvedValue(anna);

    renderAuth();

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("in"));
    expect(oidc.userManager.signinSilent).toHaveBeenCalled();
  });

  it("treats a session it cannot renew as signed out", async () => {
    oidc.userManager.getUser.mockResolvedValue({ ...anna, expired: true, refresh_token: "r" });
    oidc.userManager.signinSilent.mockRejectedValue(new Error("expired"));

    renderAuth();

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("out"));
  });

  it("wipes a garden cached for a different account", async () => {
    useFlowerStore.setState({ savedFlowers: [savedFlower], ownerUserId: "sub-ben" });
    oidc.userManager.getUser.mockResolvedValue(anna);

    renderAuth();

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("in"));
    expect(useFlowerStore.getState().savedFlowers).toEqual([]);
  });

  it("keeps the garden cached for the same account", async () => {
    useFlowerStore.setState({ savedFlowers: [savedFlower], ownerUserId: "sub-anna" });
    oidc.userManager.getUser.mockResolvedValue(anna);

    renderAuth();

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("in"));
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
  });

  it("clears the store when the session ends elsewhere", async () => {
    useFlowerStore.setState({ savedFlowers: [savedFlower], ownerUserId: "sub-anna" });
    oidc.userManager.getUser.mockResolvedValue(anna);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("in"));

    act(() => oidc.listeners.unloaded?.());

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("out"));
    expect(useFlowerStore.getState().savedFlowers).toEqual([]);
  });

  it("signs out of the provider and clears the store", async () => {
    useFlowerStore.setState({ savedFlowers: [savedFlower], ownerUserId: "sub-anna" });
    oidc.userManager.getUser.mockResolvedValue(anna);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("in"));

    await act(() => signOutRef());

    expect(oidc.signOutOfProvider).toHaveBeenCalled();
    expect(useFlowerStore.getState().savedFlowers).toEqual([]);
    expect(screen.getByTestId("state").textContent).toBe("out");
  });
});
