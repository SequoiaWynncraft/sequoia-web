import type { RequestHandler } from "./$types";

import { proxyToBagshop } from "$lib/server/bagshop";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH"]);

/**
 * Backend-for-frontend proxy to the internal bag shop bot. Every method/path is forwarded
 * verbatim with the viewer's seq_session cookie attached as a bearer token; the bot enforces
 * customer-vs-staff authorization, so this layer stays a thin, credential-forwarding pass-through.
 */
const handle: RequestHandler = async ({ params, request, cookies, url }) => {
  const method = request.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return jsonError(405, "method_not_allowed");
  }

  const subpath = params.path ?? "";
  // Fixed internal origin + no path traversal: this can only ever reach the bag shop.
  if (subpath.includes("..")) {
    return jsonError(400, "bad_path");
  }

  const hasBody = method === "POST" || method === "PATCH";
  // Collapse an empty body to undefined so a bodyless POST/PATCH forwards no body at all.
  const body = hasBody ? (await request.text()) || undefined : undefined;

  return proxyToBagshop(`/${subpath}`, {
    method,
    token: cookies.get("seq_session"),
    search: url.search,
    body,
  });
};

/** Builds a no-store JSON error response with an `{ error }` body. */
function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
