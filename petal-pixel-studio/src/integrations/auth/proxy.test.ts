import { describe, it, expect } from "vitest";
import { forwardedHeaders, proxyTarget, sameSiteCookie } from "./proxy";

const BASE = "https://auth.example/neondb/auth";

describe("proxyTarget", () => {
  it("joins the path to the auth service and keeps the query", () => {
    const url = proxyTarget(BASE, new URL("https://site.test/api/auth-proxy?path=get-session&token=abc"));
    expect(url).toBe("https://auth.example/neondb/auth/get-session?token=abc");
  });

  it("keeps nested paths", () => {
    const url = proxyTarget(BASE, new URL("https://site.test/api/auth-proxy?path=.well-known/jwks.json"));
    expect(url).toBe("https://auth.example/neondb/auth/.well-known/jwks.json");
  });

  it.each(["../admin", "get-session/../../secret", "//evil.example/x", "https://evil.example", ""])(
    "refuses %j",
    (path) => {
      expect(proxyTarget(BASE, new URL(`https://site.test/api/auth-proxy?path=${encodeURIComponent(path)}`))).toBeNull();
    },
  );
});

describe("forwardedHeaders", () => {
  const incoming = new Headers({
    cookie: "a=1",
    "content-type": "application/json",
    origin: "https://site.test",
    "x-forwarded-host": "site.test",
    "x-forwarded-for": "1.2.3.4",
    host: "site.test",
    "x-vercel-id": "sin1",
  });

  it("drops the header the auth service rejects", () => {
    expect(forwardedHeaders(incoming).has("x-forwarded-host")).toBe(false);
  });

  it("passes what a session needs", () => {
    const out = forwardedHeaders(incoming);
    expect(out.get("cookie")).toBe("a=1");
    expect(out.get("origin")).toBe("https://site.test");
    expect(out.get("content-type")).toBe("application/json");
  });

  it("names the real client, so one person's limit isn't everyone's", () => {
    expect(forwardedHeaders(incoming).get("x-forwarded-for")).toBe("1.2.3.4");
  });

  it("forwards nothing it doesn't know", () => {
    expect(forwardedHeaders(incoming).has("x-vercel-id")).toBe(false);
    expect(forwardedHeaders(incoming).has("host")).toBe(false);
  });
});

describe("sameSiteCookie", () => {
  it("binds a cookie to this site instead of the auth service", () => {
    expect(sameSiteCookie("__Secure-s=1; Domain=auth.example; Path=/; Secure; HttpOnly; SameSite=None; Partitioned")).toBe(
      "__Secure-s=1; Path=/; Secure; HttpOnly; SameSite=Lax",
    );
  });

  it("leaves a plain cookie readable", () => {
    expect(sameSiteCookie("a=1; Path=/; HttpOnly")).toBe("a=1; Path=/; HttpOnly");
  });
});
