import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { discordManagement } from "#lib/server/discordManagement.js";

const proxy: RequestHandler = async ({ fetch, request, cookies, params, url }) => {
  const path = params.path;
  if (!/^(access|context|emojis|self-service-roles|welcome(?:\/preview)?|ceremonies(?:\/preview)?|achievements\/catalog|assets(?:\/[0-9a-f-]{36})?|messages(?:\/adopt|\/[0-9a-f-]{36}(?:\/publish|\/recover|\/retire-source|\/restore-thread)?)?)$/.test(path)) {
    error(404, "Not found");
  }
  const write = request.method !== "GET";
  if (path === "welcome" && !["GET", "PUT"].includes(request.method)) error(405, "Method not allowed");
  if (path === "welcome/preview" && request.method !== "POST") error(405, "Method not allowed");
  if (path === "ceremonies" && !["GET", "PUT"].includes(request.method)) error(405, "Method not allowed");
  if (path === "ceremonies/preview" && request.method !== "POST") error(405, "Method not allowed");
  if (path === "achievements/catalog" && !["GET", "PUT"].includes(request.method)) error(405, "Method not allowed");
  if (write && request.headers.get("origin") !== url.origin) error(403, "Invalid request origin");
  const response = await discordManagement(fetch, cookies.get("seq_session"), `${path}${url.search}`, {
    method: request.method,
    body: write ? await request.text() : undefined,
  });
  if (/^assets\/[0-9a-f-]{36}$/.test(path) && request.method === "GET" && response.ok && /^image\/(png|jpeg|gif|webp)$/.test(response.headers.get("content-type") ?? "")) {
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type")!, "cache-control": "private, no-store" } });
  }
  if ((path === "welcome/preview" || path === "ceremonies/preview") && response.ok && /^image\/(png|gif)$/.test(response.headers.get("content-type") ?? "")) {
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type")!, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  }
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
