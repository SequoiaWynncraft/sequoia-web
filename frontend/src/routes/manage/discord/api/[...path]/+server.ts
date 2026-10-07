import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { discordManagement } from "$lib/server/discordManagement";

const proxy: RequestHandler = async ({ fetch, request, cookies, params, url }) => {
  const path = params.path;
  if (!/^(context|emojis|self-service-roles|messages(?:\/adopt|\/[0-9a-f-]{36}(?:\/publish|\/recover)?)?)$/.test(path)) {
    error(404, "Not found");
  }
  const write = request.method !== "GET";
  if (write && request.headers.get("origin") !== url.origin) error(403, "Invalid request origin");
  const response = await discordManagement(fetch, cookies.get("seq_session"), path, {
    method: request.method,
    body: write ? await request.text() : undefined,
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    const detail = response.status < 500 ? await response.text() : "Discord management could not complete the request";
    return Response.json({ error: detail }, { status: response.status, headers: { "cache-control": "no-store" } });
  }
  return new Response(response.body, {
    status: response.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
