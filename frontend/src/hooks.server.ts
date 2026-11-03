import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";

import { legacyManageRedirect } from "#lib/manage/redirects.js";
import { closeDatabase } from "#lib/server/db.js";
import { retireAllRooms } from "#lib/server/liveRolls.js";
import { applySecurityHeaders } from "#lib/server/securityHeaders.js";
import { fillBrandPlaceholders } from "#lib/site/brand.js";
import { parseThemeId, THEME_COOKIE } from "#lib/site/themePreferences.js";
import { REQUEST_FINISHED, REQUEST_STARTED } from "../retirement.js";

/** Docker uses a signal adapter-node does not consume so its listener stays live during the drain. */
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

  // A stale tab's form POST to a legacy management path must reach the real
  // action with its body intact. A redirect can't deliver that: actions
  // dispatch before `load`, and `use:enhance` clients turn a redirect action
  // result into a GET navigation, dropping the submission. Re-dispatch the
  // request at its console home instead - both native and enhanced forms
  // then get the destination action's genuine result.
  if (event.request.method === "POST") {
    const target = legacyManageRedirect(event.url.pathname, event.url.search);
    if (target) {
      const body = await event.request.arrayBuffer();
      response = await event.fetch(
        new Request(new URL(target, event.url.origin), {
          method: "POST",
          headers: event.request.headers,
          body,
          // A redirecting action (create's 303, delete's 303) must reach the
          // BROWSER - following it here would return the destination's HTML
          // while the address bar stays on the legacy URL.
          redirect: "manual",
        }),
      );
    }
  }

  // The chosen palette has to be on <html> before any CSS applies, so it is
  // stamped into the shell rather than set from the client - no flash of the
  // wrong theme, and no client JS involved.
  response ??= await resolve(event, {
    transformPageChunk: ({ html }) =>
      fillBrandPlaceholders(html.replace("%seq.theme%", parseThemeId(event.cookies.get(THEME_COOKIE)))),
  });
  response.headers.set("x-request-id", requestId);
  applySecurityHeaders(response.headers, event.url);

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("text/html") || event.url.pathname.endsWith("/__data.json")) {
    // Every page includes session-aware layout data. Never reuse its HTML or
    // SvelteKit data response after logout or across a deployment.
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

/**
 * Every error reaches this hook, including expected `error(...)` responses and
 * framework 404s. Only server failures are logged; the returned fields are
 * merged over SvelteKit's own safe status and message.
 */
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

/** The 5xx status of a failure the app did not raise itself, or null for anything else. */
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
