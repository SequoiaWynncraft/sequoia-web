import { env } from "$env/dynamic/private";

const DEFAULT_BAGSHOP_URL = "http://localhost:8090";

/** Absolute URL for a bag shop API path against the configured internal origin. */
export function bagshopUrl(path: string): string {
  const base = (env.BAGSHOP_API_URL || DEFAULT_BAGSHOP_URL).replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

interface ProxyOptions {
  method: string;
  /** The viewer's seq_session cookie value; forwarded as a bearer token. */
  token: string | undefined;
  /** Query string including the leading "?", when present. */
  search?: string;
  /** Raw request body for POST/PATCH. */
  body?: string;
}

/**
 * Forwards a request to the internal bag shop API, attaching the viewer's session JWT
 * as a bearer token. The token and the bag shop origin never reach the browser. Returns a
 * JSON `503` when the bag shop is unreachable, otherwise passes the upstream status/body
 * through unchanged. The bag shop itself enforces auth (customer vs. allowlisted staff).
 */
export async function proxyToBagshop(path: string, opts: ProxyOptions): Promise<Response> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  let upstream: Response;
  try {
    upstream = await fetch(bagshopUrl(path) + (opts.search ?? ""), {
      method: opts.method,
      headers,
      body: opts.body,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return new Response(JSON.stringify({ error: "bagshop_unreachable" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
