import type { RequestHandler } from "./$types";

import { proxyToBagshop } from "#lib/server/bagshop.js";

// The endpoint table in `proxyToBagshop` decides which method and path pairs
// exist; everything else is a 404 there, and other methods a 405 here.
const handle: RequestHandler = async ({ params, request, cookies }) => {
  const hasBody = request.method === "POST" || request.method === "PATCH";
  return proxyToBagshop({
    method: request.method,
    path: params.path ?? "",
    token: cookies.get("seq_session"),
    body: hasBody ? await request.text() : undefined,
  });
};

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
