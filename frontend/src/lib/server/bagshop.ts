import { BAGSHOP_API_URL } from "$app/env/private";

const DEFAULT_BAGSHOP_URL = "http://localhost:8090";

export function bagshopUrl(path: string): string {
  const base = (BAGSHOP_API_URL || DEFAULT_BAGSHOP_URL).replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

interface ProxyOptions {
  method: string;
  token: string | undefined;
  search?: string;
  body?: string;
}

export async function proxyToBagshop(path: string, opts: ProxyOptions): Promise<Response> {
  const body = opts.body ? opts.body : undefined;
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  try {
    const upstream = await fetch(bagshopUrl(path) + (opts.search ?? ""), {
      method: opts.method,
      headers,
      body,
      signal: AbortSignal.timeout(5000),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error(`bag shop proxy request to ${path} failed:`, err);
    return new Response(JSON.stringify({ error: "bagshop_unreachable" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}
