import { describe, it, expect, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getSession: vi.fn(),
  token: vi.fn(),
}));

vi.mock("@neon/auth", () => ({ createAuthClient: () => sdk }));

import { authErrorMessage, getAccessToken, resolveAuthUrl } from "./neon";

describe("authErrorMessage", () => {
  it("does not reveal whether the email exists on a failed sign-in", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe("That email and password don't match.");
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe("That email and password don't match.");
  });

  it("explains an email that is already registered", () => {
    expect(authErrorMessage({ code: "USER_ALREADY_EXISTS" })).toBe(
      "There is already an account with this email. Sign in instead.",
    );
  });

  it("says what a too-short password needs", () => {
    expect(authErrorMessage({ code: "PASSWORD_TOO_SHORT" })).toBe("Use at least 8 characters.");
  });

  it("asks to wait when requests are limited", () => {
    expect(authErrorMessage({ status: 429 })).toBe("Too many attempts. Wait a minute and try again.");
  });

  it("falls back to a plain message instead of a server string", () => {
    expect(authErrorMessage({ code: "SOMETHING_NEW", message: "internal: pg error 23505" })).toBe(
      "Couldn't reach the sign-in service. Try again shortly.",
    );
    expect(authErrorMessage(undefined)).toBe("Couldn't reach the sign-in service. Try again shortly.");
  });
});

describe("resolveAuthUrl", () => {
  it("keeps a full URL", () => {
    expect(resolveAuthUrl("https://auth.example/neondb/auth", "https://site.test")).toBe(
      "https://auth.example/neondb/auth",
    );
  });

  it("puts a same-site path on the current origin", () => {
    expect(resolveAuthUrl("/auth-api", "https://site.test")).toBe("https://site.test/auth-api");
  });

  it("is empty when the hosted provider is not configured", () => {
    expect(resolveAuthUrl(undefined, "https://site.test")).toBe("");
  });
});

describe("getAccessToken", () => {
  it("treats an unreachable auth service as a guest, so growing a flower still works", async () => {
    sdk.getSession.mockRejectedValue(new Error("400"));
    await expect(getAccessToken()).resolves.toBeNull();
  });

  it("is empty for a guest and asks for no token", async () => {
    sdk.getSession.mockResolvedValue({ data: null, error: null });
    await expect(getAccessToken()).resolves.toBeNull();
    expect(sdk.token).not.toHaveBeenCalled();
  });
});
