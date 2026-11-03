import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";

import { legacyManageRedirect } from "#lib/manage/redirects.js";
import { closeDatabase } from "#lib/server/db.js";
import { retireAllRooms } from "#lib/server/liveRolls.js";
import { applySecurityHeaders } from "#lib/server/securityHeaders.js";
import { fillBrandPlaceholders } from "#lib/site/brand.js";
import { parseThemeId, THEME_COOKIE } from "#lib/site/themePreferences.js";
import { REQUEST_FINISHED, REQUEST_STARTED } from "../retirement.js";

export const init: ServerInit = () => {
  process.once("SIGUSR2", retireAllRooms);
  process.once("sveltekit:shutdown", closeDatabase);
};

export const handle: Handle = async (input) => {
  process.emit(REQUEST_STARTED);
  try {
    return await handleRequest(input);
  } finally {
    process.emit(REQUEST_FINISHED);
  }
};

const handleRequest: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  event.locals.requestId = requestId;
  let response: Response | undefined;

  if (event.request.method === "POST") {
    const target = legacyManageRedirect(event.url.pathname, event.url.search);
    if (target) {
      const body = await event.request.arrayBuffer();
      response = await event.fetch(
        new Request(new URL(target, event.url.origin), {
          method: "POST",
          headers: event.request.headers,
          body,
          redirect: "manual",
        }),
      );
    }
  }

  response ??= await resolve(event, {
    transformPageChunk: ({ html }) =>
      fillBrandPlaceholders(html.replace("%seq.theme%", parseThemeId(event.cookies.get(THEME_COOKIE)))),
  });
  response.headers.set("x-request-id", requestId);
  applySecurityHeaders(response.headers, event.url);

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("text/html") || event.url.pathname.endsWith("/__data.json")) {
    response.headers.set("cache-control", "private, no-store");
  }

  if (response.status >= 400) {
    console.warn("frontend error response", {
      requestId,
      method: event.request.method,
      path: event.url.pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  return response;
};

export const handleError: HandleServerError = (caught) => {
  const { event } = caught;
  const requestId = event.locals.requestId ?? crypto.randomUUID();
  const status = serverFailureStatus(caught);
  if (status !== null) {
    console.error("unexpected frontend error", {
      requestId,
      method: event.request.method,
      path: event.url.pathname,
      status,
      error: caught.error,
    });
  }
  return { requestId };
};

function serverFailureStatus(caught: Parameters<HandleServerError>[0]): number | null {
  switch (caught.kind) {
    case "unknown":
      return 500;
    case "framework":
      return caught.error.status >= 500 ? caught.error.status : null;
    case "app":
    case "validation":
      return null;
    default: {
      const _exhaustive: never = caught;
      return _exhaustive;
    }
  }
}
