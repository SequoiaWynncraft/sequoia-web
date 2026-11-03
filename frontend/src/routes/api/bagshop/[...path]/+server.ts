import type { RequestHandler } from "./$types";

import { proxyToBagshop } from "#lib/server/bagshop.js";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH"]);

const handle: RequestHandler = async ({ params, request, cookies, url }) => {
  const method = request.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return jsonError(405, "method_not_allowed");
  }

  const subpath = params.path ?? "";
  if (subpath.includes("..")) {
    return jsonError(400, "bad_path");
  }

  const hasBody = method === "POST" || method === "PATCH";
  const body = hasBody ? (await request.text()) || undefined : undefined;

  return proxyToBagshop(`/${subpath}`, {
    method,
    token: cookies.get("seq_session"),
    search: url.search,
    body,
  });
};

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
