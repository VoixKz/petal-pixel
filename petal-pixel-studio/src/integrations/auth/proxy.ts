// Sign-in travels through our own domain so Safari treats its cookie as
// first-party. A plain rewrite won't do: Vercel adds X-Forwarded-Host to it and
// the auth service refuses that, so api/auth-proxy.ts forwards a chosen set.

const FORWARDED = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "origin",
  "referer",
  "user-agent",
  "x-forwarded-for",
  "x-neon-client-info",
];

/** Where a proxied request goes, or null when its path could leave the auth service. */
export function proxyTarget(base: string, request: URL): string | null {
  const path = request.searchParams.get("path") ?? "";
  if (!path || path.startsWith("/") || path.includes("://") || path.split("/").includes("..")) return null;
  const rest = new URLSearchParams(request.searchParams);
  rest.delete("path");
  const query = rest.toString();
  return `${base}/${path}${query ? `?${query}` : ""}`;
}

export function forwardedHeaders(incoming: Headers): Headers {
  const out = new Headers();
  for (const name of FORWARDED) {
    const value = incoming.get(name);
    if (value) out.set(name, value);
  }
  return out;
}

/** The cookie now belongs to this site, so it no longer needs its cross-site attributes. */
export function sameSiteCookie(cookie: string): string {
  return cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => !/^(domain=|partitioned$)/i.test(part))
    .map((part) => (/^samesite=/i.test(part) ? "SameSite=Lax" : part))
    .join("; ");
}
