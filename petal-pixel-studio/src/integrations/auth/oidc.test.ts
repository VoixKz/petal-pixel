import { describe, it, expect, vi, beforeEach } from "vitest";

const manager = vi.hoisted(() => ({
  getUser: vi.fn(),
  signinRedirect: vi.fn(async () => undefined),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(async () => undefined),
  removeUser: vi.fn(async () => undefined),
  events: {},
}));

vi.mock("oidc-client-ts", () => ({
  UserManager: vi.fn(() => manager),
  WebStorageStateStore: vi.fn(),
}));

import {
  completeSignIn,
  getAccessToken,
  getSignedInUserId,
  redirectToSignIn,
  redirectToSignUp,
  safeReturnPath,
} from "./oidc";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAccessToken", () => {
  it("returns the token of a live session", async () => {
    manager.getUser.mockResolvedValue({ access_token: "abc", expired: false });

    await expect(getAccessToken()).resolves.toBe("abc");
  });

  it("returns nothing for an expired session", async () => {
    manager.getUser.mockResolvedValue({ access_token: "abc", expired: true });

    await expect(getAccessToken()).resolves.toBeNull();
  });

  it("returns nothing when signed out", async () => {
    manager.getUser.mockResolvedValue(null);

    await expect(getAccessToken()).resolves.toBeNull();
  });
});

describe("getSignedInUserId", () => {
  it("is the identity's subject", async () => {
    manager.getUser.mockResolvedValue({ expired: false, profile: { sub: "sub-anna" } });

    await expect(getSignedInUserId()).resolves.toBe("sub-anna");
  });

  it("is null when signed out", async () => {
    manager.getUser.mockResolvedValue(null);

    await expect(getSignedInUserId()).resolves.toBeNull();
  });
});

describe("redirects", () => {
  it("carries the page to return to through sign-in", async () => {
    await redirectToSignIn("/create?name=Anna");

    expect(manager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: "/create?name=Anna" } });
  });

  it("opens the registration form for sign-up", async () => {
    await redirectToSignUp("/create");

    expect(manager.signinRedirect).toHaveBeenCalledWith({
      state: { returnTo: "/create" },
      prompt: "create",
    });
  });
});

describe("completeSignIn", () => {
  it("returns the page the user came from", async () => {
    manager.signinRedirectCallback.mockResolvedValue({ state: { returnTo: "/create?name=Anna" } });

    await expect(completeSignIn()).resolves.toBe("/create?name=Anna");
  });

  it("falls back to the home page", async () => {
    manager.signinRedirectCallback.mockResolvedValue({ state: undefined });

    await expect(completeSignIn()).resolves.toBe("/");
  });

  it("refuses to send the user to another site", async () => {
    manager.signinRedirectCallback.mockResolvedValue({ state: { returnTo: "https://evil.test/" } });

    await expect(completeSignIn()).resolves.toBe("/");
  });
});

describe("safeReturnPath", () => {
  it.each([
    ["/create?name=Anna", "/create?name=Anna"],
    ["/", "/"],
    ["https://evil.test", "/"],
    ["//evil.test", "/"],
    ["/\\evil.test", "/"],
    ["", "/"],
    [undefined, "/"],
    [42, "/"],
  ])("maps %s to %s", (input, want) => {
    expect(safeReturnPath(input)).toBe(want);
  });
});
