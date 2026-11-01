import { forwardedHeaders, proxyTarget, sameSiteCookie } from "../src/integrations/auth/proxy.js";

const NOT_PASSED_BACK = new Set(["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection"]);

export default {
  async fetch(request: Request) {
    const base = process.env.NEON_AUTH_BASE_URL;
    const target = base ? proxyTarget(base, new URL(request.url)) : null;
    if (!target) return new Response("Not found", { status: 404 });

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await fetch(target, {
      method: request.method,
      headers: forwardedHeaders(request.headers),
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });

    const headers = new Headers();
    upstream.headers.forEach((value, name) => {
      if (!NOT_PASSED_BACK.has(name) && !name.startsWith("access-control-")) headers.set(name, value);
    });
    for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie", sameSiteCookie(cookie));

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
